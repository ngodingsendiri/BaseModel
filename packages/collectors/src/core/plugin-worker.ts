import { pathToFileURL } from 'node:url';
import type {
  CollectionResult,
  CustomGateway,
  GatewayDescriptor,
  GatewayPlugin,
} from './collector.js';
import { MAX_PLUGIN_MODELS, MAX_PLUGIN_RESPONSE_BYTES } from './collector.js';

type WorkerRequest =
  | { action: 'describe'; pluginPath: string; secretKeys: string[] }
  | { action: 'collect'; pluginPath: string; secretKeys: string[] };

type WorkerResponse =
  | { ok: true; descriptor: GatewayDescriptor }
  | { ok: true; result: CollectionResult }
  | { ok: false; error: string };

function send(response: WorkerResponse): void {
  if (typeof process.send !== 'function') {
    throw new Error('Gateway worker must be started through child_process.fork().');
  }
  process.send(response);
}

function redact(value: string, secrets: readonly string[]): string {
  return secrets
    .filter(Boolean)
    .reduce((result, secret) => result.split(secret).join('[REDACTED]'), value);
}

function validateResult(result: CollectionResult, secrets: readonly string[]): void {
  if (!result || !Array.isArray(result.models) || !Array.isArray(result.errors)) {
    throw new Error('Plugin returned an invalid collection result.');
  }
  if (result.models.length > MAX_PLUGIN_MODELS) {
    throw new Error(`Plugin returned more than ${MAX_PLUGIN_MODELS} models.`);
  }
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PLUGIN_RESPONSE_BYTES) {
    throw new Error(`Plugin response exceeds ${MAX_PLUGIN_RESPONSE_BYTES} bytes.`);
  }
  if (secrets.some((secret) => secret && serialized.includes(secret))) {
    throw new Error('Plugin result contains a configured secret.');
  }
}

function isGatewayPlugin(value: unknown): value is GatewayPlugin {
  if (!value || typeof value !== 'object') return false;
  const plugin = value as Partial<GatewayPlugin>;
  return (
    (plugin.type === 'openai-compatible' || plugin.type === 'custom') &&
    typeof plugin.id === 'string' &&
    plugin.id.length > 0
  );
}

function getDescriptor(plugin: GatewayPlugin): GatewayDescriptor {
  if (plugin.type === 'openai-compatible') {
    if (typeof plugin.baseUrl !== 'string' || typeof plugin.secretKeyName !== 'string') {
      throw new Error('OpenAI-compatible plugin is missing baseUrl or secretKeyName.');
    }
    return {
      type: plugin.type,
      id: plugin.id,
      baseUrl: plugin.baseUrl,
      secretKeyName: plugin.secretKeyName,
    };
  }

  if (typeof plugin.collect !== 'function') throw new Error('Custom plugin is missing collect().');
  return { type: plugin.type, id: plugin.id };
}

async function loadPlugin(pluginPath: string): Promise<GatewayPlugin> {
  const moduleUrl = pathToFileURL(pluginPath).href;
  const module = (await import(moduleUrl)) as { default?: unknown };
  if (!isGatewayPlugin(module.default)) {
    throw new Error('Plugin is missing required fields: type and id.');
  }
  return module.default;
}

let activeSecrets: string[] = [];

async function main(): Promise<void> {
  const request = JSON.parse(process.argv[2] ?? '') as WorkerRequest;
  const plugin = await loadPlugin(request.pluginPath);
  const descriptor = getDescriptor(plugin);

  if (request.action === 'describe') {
    send({ ok: true, descriptor });
    return;
  }
  if (plugin.type !== 'custom')
    throw new Error('Only custom plugins can be collected in a worker.');

  const secrets = Object.fromEntries(
    request.secretKeys.map((key) => [key, process.env[key]]),
  ) as Record<string, string | undefined>;
  activeSecrets = Object.values(secrets).filter((value): value is string => Boolean(value));
  const result = await (plugin as CustomGateway).collect(secrets);
  validateResult(result, activeSecrets);
  send({ ok: true, result });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  send({ ok: false, error: redact(message, activeSecrets) });
  process.exitCode = 1;
});
