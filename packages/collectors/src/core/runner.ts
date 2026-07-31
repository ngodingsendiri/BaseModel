import { fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getModel,
  getProvider,
  mergeModelData,
  saveModel,
  saveProvider,
  validate,
} from '@basemodel/registry';
import type { Provider } from '@basemodel/schema';
import { ProviderSchema } from '@basemodel/schema';
import { z } from 'zod';
import type { CollectionResult, GatewayDescriptor } from './collector.js';
import { getGatewaySecretKeys } from './gateway-secrets.js';

const OpenAICompatibleResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      context_length: z.number().optional(),
      created: z.number().optional(),
    }),
  ),
});

/**
 * Normalizes a raw API model id into a schema-valid model slug.
 * OpenAI-compatible APIs may return ids that are prefixed with an organization
 * (e.g. "sesame/csm-1b") or carry route suffixes (e.g. "gpt-4o:free"), none of
 * which are valid in a `{provider}/{slug}` model_id. We take the last path
 * segment and keep only the characters allowed by the ModelSchema slug regex.
 */
export function toModelSlug(apiId: string): string {
  const lastSegment = (apiId.split('/').pop() ?? apiId).toLowerCase();
  const slug = lastSegment
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'model';
}

/**
 * Guarantees every persisted model uses a schema-valid `{provider}/{slug}`
 * model_id. Custom gateways may emit org-prefixed or routed ids (e.g.
 * "vercel/openai/gpt-4o"), so we re-key the id against the provider that
 * actually reported the model. Idempotent for already-valid ids.
 */
export function normalizeModelId(modelId: string, providerId: string): string {
  const slug = toModelSlug(modelId.split('/').pop() ?? modelId);
  return `${providerId}/${slug}`;
}

const PLUGIN_TIMEOUT_MS = 60_000;
const RUNTIME_ENVIRONMENT_KEYS = [
  'HOME',
  'PATH',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'WINDIR',
] as const;

type WorkerResponse =
  | { ok: true; descriptor: GatewayDescriptor }
  | { ok: true; result: CollectionResult }
  | { ok: false; error: string };

function getWorkerPath(): { path: string; usesTypeScript: boolean } {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = path.extname(currentFile);
  return {
    path: path.join(path.dirname(currentFile), `plugin-worker${extension}`),
    usesTypeScript: extension === '.ts',
  };
}

/** Builds the complete environment for an isolated gateway worker. */
export function createPluginEnvironment(
  secretKeys: readonly string[],
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of RUNTIME_ENVIRONMENT_KEYS) {
    const value = sourceEnvironment[key];
    if (value !== undefined) environment[key] = value;
  }
  for (const key of secretKeys) {
    const value = sourceEnvironment[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function runWorker(request: {
  action: 'describe' | 'collect';
  pluginPath: string;
  secretKeys: string[];
}): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const workerPath = getWorkerPath();
    const worker = fork(workerPath.path, [JSON.stringify(request)], {
      cwd: process.cwd(),
      env: createPluginEnvironment(request.secretKeys),
      execArgv: workerPath.usesTypeScript ? ['--import', 'tsx'] : [],
      serialization: 'advanced',
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    worker.stdout?.resume();
    worker.stderr?.resume();
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      worker.kill();
      settle(() => reject(new Error(`Plugin worker timed out after ${PLUGIN_TIMEOUT_MS}ms.`)));
    }, PLUGIN_TIMEOUT_MS);

    worker.on('message', (message: WorkerResponse) => {
      settle(() => resolve(message));
      if (worker.connected) worker.disconnect();
    });
    worker.on('error', (error) => settle(() => reject(error)));
    worker.on('exit', (code) => {
      if (!settled) {
        settle(() =>
          reject(new Error(`Plugin worker exited before responding (code ${code ?? 'unknown'}).`)),
        );
      }
    });
  });
}

/** Loads plugin metadata without exposing credentials to plugin code. */
export async function describeGatewayPlugin(pluginPath: string): Promise<GatewayDescriptor> {
  const response = await runWorker({ action: 'describe', pluginPath, secretKeys: [] });
  if (!response.ok || !('descriptor' in response)) {
    throw new Error(
      response.ok ? 'Plugin worker returned an unexpected response.' : response.error,
    );
  }
  return response.descriptor;
}

async function runSimpleGateway(
  plugin: Extract<GatewayDescriptor, { type: 'openai-compatible' }>,
  apiKey: string | undefined,
): Promise<CollectionResult> {
  const result: CollectionResult = { provider_id: plugin.id, models: [], errors: [] };
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    else result.errors.push(`No API key is registered for gateway ${plugin.id}.`);

    const response = await fetch(`${plugin.baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const parsed = OpenAICompatibleResponseSchema.safeParse((await response.json()) as unknown);
    if (!parsed.success) {
      result.errors.push(`Failed to parse response from ${plugin.id}: ${parsed.error.message}`);
      return result;
    }
    for (const apiModel of parsed.data.data) {
      const slug = toModelSlug(apiModel.id);
      result.models.push({
        model_id: `${plugin.id}/${slug}`,
        provider_id: plugin.id,
        name: apiModel.id,
        context_window: apiModel.context_length,
        status: 'active',
        modality: ['text'],
        open_weight: false,
        reasoning_support: false,
        function_calling: false,
        structured_output: false,
        vision_support: false,
        audio_support: false,
        image_generation: false,
        embedding_support: false,
      });
    }
  } catch (error: unknown) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }
  return result;
}

/** Executes a plugin with only centrally approved secrets for its gateway ID. */
export async function executeGatewayPlugin(
  pluginPath: string,
  plugin: GatewayDescriptor,
): Promise<CollectionResult> {
  const secretKeys = getGatewaySecretKeys(plugin.id);
  if (plugin.type === 'openai-compatible') {
    if (!secretKeys.includes(plugin.secretKeyName)) {
      throw new Error(
        `Gateway ${plugin.id} requests unapproved secret ${plugin.secretKeyName}. Register it in gateway-secrets.ts.`,
      );
    }
    return runSimpleGateway(plugin, process.env[plugin.secretKeyName]);
  }

  const response = await runWorker({ action: 'collect', pluginPath, secretKeys: [...secretKeys] });
  if (!response.ok || !('result' in response)) {
    throw new Error(
      response.ok ? 'Plugin worker returned an unexpected response.' : response.error,
    );
  }
  return response.result;
}

interface ProviderInfo {
  name: string;
  organization: string;
  website: string;
  provider_type: Provider['provider_type'];
}

/**
 * Metadata used to auto-register a provider the first time a gateway collects
 * models for it. Providers that already exist in data/registry/providers
 * (openai, anthropic, google, meta, mistral-ai) are never overwritten.
 */
const PROVIDER_INFO: Record<string, ProviderInfo> = {
  cerebras: {
    name: 'Cerebras',
    organization: 'Cerebras Systems',
    website: 'https://www.cerebras.ai',
    provider_type: 'first-party',
  },
  cloudflare: {
    name: 'Cloudflare',
    organization: 'Cloudflare, Inc.',
    website: 'https://www.cloudflare.com',
    provider_type: 'first-party',
  },
  deepinfra: {
    name: 'DeepInfra',
    organization: 'DeepInfra',
    website: 'https://deepinfra.com',
    provider_type: 'first-party',
  },
  fireworks: {
    name: 'Fireworks AI',
    organization: 'Fireworks AI',
    website: 'https://fireworks.ai',
    provider_type: 'first-party',
  },
  groq: {
    name: 'Groq',
    organization: 'Groq, Inc.',
    website: 'https://groq.com',
    provider_type: 'first-party',
  },
  helicone: {
    name: 'Helicone',
    organization: 'Helicone',
    website: 'https://www.helicone.ai',
    provider_type: 'gateway',
  },
  hyperbolic: {
    name: 'Hyperbolic',
    organization: 'Hyperbolic Labs, Inc.',
    website: 'https://hyperbolic.xyz',
    provider_type: 'first-party',
  },
  'mistral-ai': {
    name: 'Mistral AI',
    organization: 'Mistral AI SAS',
    website: 'https://mistral.ai',
    provider_type: 'first-party',
  },
  openrouter: {
    name: 'OpenRouter',
    organization: 'OpenRouter',
    website: 'https://openrouter.ai',
    provider_type: 'router',
  },
  portkey: {
    name: 'Portkey',
    organization: 'Portkey AI',
    website: 'https://portkey.ai',
    provider_type: 'gateway',
  },
  requesty: {
    name: 'Requesty',
    organization: 'Requesty',
    website: 'https://requesty.ai',
    provider_type: 'gateway',
  },
  together: {
    name: 'Together AI',
    organization: 'Together AI',
    website: 'https://www.together.ai',
    provider_type: 'first-party',
  },
  vercel: {
    name: 'Vercel',
    organization: 'Vercel, Inc.',
    website: 'https://vercel.com',
    provider_type: 'gateway',
  },
};

function toTitleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Registers a minimal Provider record the first time models reference it. */
async function ensureProviderRegistered(providerId: string): Promise<void> {
  const existing = await getProvider(providerId);
  if (existing) return;
  const info = PROVIDER_INFO[providerId];
  const provider: Provider = {
    provider_id: providerId,
    name: info?.name ?? toTitleCase(providerId),
    organization: info?.organization ?? toTitleCase(providerId),
    website: info?.website ?? `https://${providerId}.com`,
    provider_type: info?.provider_type ?? 'gateway',
    status: 'active',
  };
  const result = validate(ProviderSchema, provider);
  if (result.success) {
    await saveProvider(result.data);
    console.log(`Registered provider ${providerId}`);
  } else {
    console.warn(`Could not register provider ${providerId}:`, result.errors);
  }
}

async function persistResult(result: CollectionResult): Promise<void> {
  if (result.models.length > 0) {
    await ensureProviderRegistered(result.provider_id);
  }
  let updatedCount = 0;
  let newCount = 0;
  let failedCount = 0;
  for (const partialModel of result.models) {
    if (!partialModel.model_id || !partialModel.provider_id) continue;
    const modelId = normalizeModelId(partialModel.model_id, partialModel.provider_id);
    const existing = await getModel(modelId);
    const mergedResult = mergeModelData(existing, { ...partialModel, model_id: modelId });
    if (mergedResult.success && mergedResult.data) {
      await saveModel(mergedResult.data);
      if (existing) updatedCount++;
      else newCount++;
    } else {
      console.error(`Failed to merge or validate ${modelId}:`, mergedResult.errors);
      failedCount++;
    }
  }
  console.log(`New: ${newCount} | Updated: ${updatedCount} | Failed: ${failedCount}`);
}

export async function runAllGateways(): Promise<void> {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const gatewaysDirectory = path.join(directory, '..', 'gateways');
  if (!fs.existsSync(gatewaysDirectory)) {
    console.warn('No gateways directory found. Nothing to collect.');
    return;
  }
  const files = fs
    .readdirSync(gatewaysDirectory)
    .filter((file) => (file.endsWith('.ts') || file.endsWith('.js')) && !file.startsWith('_'));
  if (files.length === 0) {
    console.warn('No gateway plugins found. Nothing to collect.');
    return;
  }

  console.log(`Found ${files.length} gateway plugin(s): ${files.join(', ')}`);
  for (const file of files) {
    const pluginPath = path.join(gatewaysDirectory, file);
    const pluginName = path.basename(file, path.extname(file));
    console.log(`Running gateway: ${pluginName}`);
    try {
      const plugin = await describeGatewayPlugin(pluginPath);
      const result = await executeGatewayPlugin(pluginPath, plugin);
      if (result.errors.length > 0) console.warn('Collection errors:', result.errors);
      console.log(`Fetched ${result.models.length} models from ${plugin.id}`);
      await persistResult(result);
    } catch (error: unknown) {
      console.error(
        `Failed to load or run gateway ${pluginName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
