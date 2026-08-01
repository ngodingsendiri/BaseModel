import { readFile, writeFile } from 'node:fs/promises';
import { generateText } from './llm.js';
import type { ManifestGateway } from './manifest.js';
import { getGatewayPluginPath } from './manifest.js';
import type { ShapeSummary } from './probe.js';
import { buildHealPrompt } from './prompts.js';
import {
  ensureFinalNewline,
  extractTsCode,
  type GeneratedPlugin,
  validateGeneratedPlugin,
} from './write.js';

export interface HealPluginOptions {
  gateway: ManifestGateway;
  shape: ShapeSummary;
  raw: unknown;
  errors?: string[];
  env?: NodeJS.ProcessEnv;
  maxAttempts?: number;
  liveSecrets?: Record<string, string | undefined>;
}

export async function healPlugin(options: HealPluginOptions): Promise<GeneratedPlugin> {
  const {
    gateway,
    shape,
    raw,
    errors = [],
    env = process.env,
    maxAttempts = 4,
    liveSecrets,
  } = options;
  const filePath = getGatewayPluginPath(gateway.id);
  const currentCode = await readFile(filePath, 'utf-8');
  let prompt = buildHealPrompt(gateway, shape, raw, currentCode, errors);
  const lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const text = await generateText({ prompt }, env);
    const code = ensureFinalNewline(extractTsCode(text));
    await writeFile(filePath, code, 'utf-8');
    const validation = await validateGeneratedPlugin(filePath, gateway.id, liveSecrets);
    if (validation.ok) return { filePath, code, attempts: attempt };
    lastErrors.push(...validation.errors);
    console.warn(`[heal] attempt ${attempt} failed validation: ${validation.errors.join('; ')}`);
    prompt += `\n\nThe previous attempt failed validation:\n${validation.errors.join('\n')}\n\nReturn the corrected file only.`;
  }

  throw new Error(
    `Failed to heal plugin for ${gateway.id} after ${maxAttempts} attempts:\n${lastErrors.join('\n')}`,
  );
}
