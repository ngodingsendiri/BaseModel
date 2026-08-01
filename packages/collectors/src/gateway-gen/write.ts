import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ModelSchema } from '@basemodel/schema';
import type { CollectionResult, GatewayPlugin } from '../core/collector.js';
import { generateText } from './llm.js';
import type { ManifestGateway } from './manifest.js';
import { getGatewayPluginPath } from './manifest.js';
import type { ShapeSummary } from './probe.js';
import { buildPluginPrompt } from './prompts.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tscBin = resolve(packageRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');

export interface GeneratePluginOptions {
  gateway: ManifestGateway;
  shape: ShapeSummary;
  raw: unknown;
  env?: NodeJS.ProcessEnv;
  maxAttempts?: number;
  liveSecrets?: Record<string, string | undefined>;
}

export interface GeneratedPlugin {
  filePath: string;
  code: string;
  attempts: number;
}

export function extractTsCode(text: string): string {
  const fenced = text.match(/```(?:ts|typescript)?\s*([\s\S]*?)```/);
  if (fenced) return (fenced[1] ?? text).trim();
  return text.trim();
}

export function checkForbiddenPatterns(code: string): string[] {
  const problems: string[] = [];
  if (/\b(?:catch\s*\([^)]*:\s*any\s*\)|as\s+any\b|:\s*any\s*[,;)\n])/.test(code)) {
    problems.push('code uses the "any" type (catch (e: any), : any, as any)');
  }
  if (/sk-[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9_-]{20,}/.test(code)) {
    problems.push('code appears to hardcode an API key');
  }
  if (/<\s*%|process\.exit\s*\(|child_process|require\(['"]child_process/.test(code)) {
    problems.push('code uses process.exit or child_process (not allowed)');
  }
  return problems;
}

export function ensureFinalNewline(code: string): string {
  return code.endsWith('\n') ? code : `${code}\n`;
}

export interface PluginValidation {
  ok: boolean;
  errors: string[];
  plugin?: GatewayPlugin;
}

export async function validatePluginModule(
  filePath: string,
  expectedId: string,
): Promise<PluginValidation> {
  try {
    const moduleUrl = `${pathToFileURL(filePath).href}?v=${Date.now()}`;
    const module = (await import(moduleUrl)) as { default?: unknown };
    const plugin = module.default as GatewayPlugin | undefined;
    const errors: string[] = [];
    if (!plugin || typeof plugin !== 'object') {
      errors.push('module has no default export');
    } else {
      if (plugin.type !== 'custom') errors.push(`expected type "custom", got "${plugin.type}"`);
      if (plugin.id !== expectedId) errors.push(`expected id "${expectedId}", got "${plugin.id}"`);
      if (typeof (plugin as { collect?: unknown }).collect !== 'function') {
        errors.push('default export has no collect() function');
      }
    }
    if (errors.length > 0) return { ok: false, errors, plugin };
    return { ok: true, errors: [], plugin };
  } catch (error: unknown) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export interface CollectionCheck {
  modelCount: number;
  validCount: number;
  errors: string[];
}

function formatIssuePath(issue: { path?: ReadonlyArray<string | number> }): string {
  return (issue.path ?? [])
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`))
    .join('')
    .replace(/^\./, '');
}

function formatModelIssue(issue: { message: string; expected?: unknown; received?: unknown }): string {
  const extra =
    issue.expected !== undefined
      ? ` (expected ${String(issue.expected)}, received ${String(issue.received)})`
      : '';
  return `${issue.message}${extra}`;
}

export async function checkCollection(
  plugin: GatewayPlugin,
  secrets: Record<string, string | undefined>,
): Promise<CollectionCheck> {
  const result: CollectionResult = await (
    plugin as {
      collect: (secrets: Record<string, string | undefined>) => Promise<CollectionResult>;
    }
  ).collect(secrets);
  let validCount = 0;
  const seen = new Set<string>();
  for (const model of result.models) {
    const parsed = ModelSchema.safeParse(model);
    if (parsed.success) {
      validCount += 1;
      continue;
    }
    const issue = (parsed.error.issues ?? [])[0] as
      | { path?: ReadonlyArray<string | number>; message: string; expected?: unknown; received?: unknown }
      | undefined;
    if (issue) {
      const label = `${formatIssuePath(issue)}: ${formatModelIssue(issue)}`;
      if (seen.size < 5) seen.add(label);
    }
  }
  const invalid = result.models.length - validCount;
  if (invalid > 0) {
    result.errors.push(`${invalid} models failed ModelSchema validation`);
    for (const label of seen) result.errors.push(`  e.g. model ${label}`);
  }
  return { modelCount: result.models.length, validCount, errors: result.errors };
}

export function runTypecheck(cwd: string = packageRoot): string[] {
  const result = spawnSync(process.execPath, [tscBin, '--noEmit'], {
    cwd,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0) return [];
  const errors = output
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
  return errors.length > 0 ? errors : [result.error?.message ?? 'typecheck failed'];
}

export interface GeneratedPluginValidation {
  ok: boolean;
  errors: string[];
  liveCheck?: CollectionCheck;
}

export async function validateGeneratedPlugin(
  filePath: string,
  gatewayId: string,
  liveSecrets?: Record<string, string | undefined>,
): Promise<GeneratedPluginValidation> {
  const code = await readFile(filePath, 'utf-8');
  const errors = [...checkForbiddenPatterns(code)];
  const validation = await validatePluginModule(filePath, gatewayId);
  errors.push(...validation.errors);
  if (errors.length === 0) {
    errors.push(...runTypecheck().map((e) => `typecheck: ${e}`));
  }
  let liveCheck: CollectionCheck | undefined;
  if (errors.length === 0 && liveSecrets && validation.plugin) {
    liveCheck = await checkCollection(validation.plugin, liveSecrets);
    console.log(
      `  live check : ${liveCheck.modelCount} models, ${liveCheck.validCount} valid`,
      liveCheck.errors.length > 0 ? `| errors: ${liveCheck.errors.join(' | ')}` : '',
    );
    if (liveCheck.errors.length > 0) {
      errors.push(...liveCheck.errors.map((e) => `live check: ${e}`));
    }
  }
  return { ok: errors.length === 0, errors, liveCheck };
}

export async function generatePlugin(options: GeneratePluginOptions): Promise<GeneratedPlugin> {
  const { gateway, shape, raw, env = process.env, maxAttempts = 4, liveSecrets } = options;
  const filePath = getGatewayPluginPath(gateway.id);
  let prompt = buildPluginPrompt(gateway, shape, raw);
  const lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const text = await generateText({ prompt }, env);
    const code = ensureFinalNewline(extractTsCode(text));
    await writeFile(filePath, code, 'utf-8');
    const validation = await validateGeneratedPlugin(filePath, gateway.id, liveSecrets);
    if (validation.ok) return { filePath, code, attempts: attempt };
    lastErrors.push(...validation.errors);
    console.warn(`[gen] attempt ${attempt} failed validation: ${validation.errors.join('; ')}`);
    prompt += `\n\nThe previous attempt failed validation:\n${validation.errors.join('\n')}\n\nReturn the corrected file only.`;
  }

  throw new Error(
    `Failed to generate a valid plugin for ${gateway.id} after ${maxAttempts} attempts:\n${lastErrors.join('\n')}`,
  );
}
