import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ModelSchema } from '@basemodel/schema';
import type { CollectionResult, GatewayPlugin } from '../core/collector.js';
import { generateText } from './llm.js';
import type { ManifestGateway } from './manifest.js';
import { getGatewayPluginPath } from './manifest.js';
import type { ShapeSummary } from './probe.js';
import { buildPluginPrompt } from './prompts.js';

export interface GeneratePluginOptions {
  gateway: ManifestGateway;
  shape: ShapeSummary;
  raw: unknown;
  env?: NodeJS.ProcessEnv;
  maxAttempts?: number;
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
  for (const model of result.models) {
    const parsed = ModelSchema.safeParse(model);
    if (parsed.success) validCount += 1;
  }
  if (result.models.length !== validCount) {
    result.errors.push(`${result.models.length - validCount} models failed ModelSchema validation`);
  }
  return { modelCount: result.models.length, validCount, errors: result.errors };
}

export async function generatePlugin(options: GeneratePluginOptions): Promise<GeneratedPlugin> {
  const { gateway, shape, raw, env = process.env, maxAttempts = 3 } = options;
  const filePath = getGatewayPluginPath(gateway.id);
  let prompt = buildPluginPrompt(gateway, shape, raw);
  const lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const text = await generateText({ prompt }, env);
    const code = ensureFinalNewline(extractTsCode(text));
    await writeFile(filePath, code, 'utf-8');
    const problems = checkForbiddenPatterns(code);
    const validation = await validatePluginModule(filePath, gateway.id);
    const allErrors = [...problems, ...validation.errors];
    if (allErrors.length === 0) return { filePath, code, attempts: attempt };
    lastErrors.push(...allErrors);
    console.warn(`[gen] attempt ${attempt} failed validation: ${allErrors.join('; ')}`);
    prompt += `\n\nThe previous attempt failed validation:\n${allErrors.join('\n')}\n\nReturn the corrected file only.`;
  }

  throw new Error(
    `Failed to generate a valid plugin for ${gateway.id} after ${maxAttempts} attempts:\n${lastErrors.join('\n')}`,
  );
}
