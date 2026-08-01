import type { ManifestGateway } from './manifest.js';
import type { ShapeSummary } from './probe.js';

const MODEL_SCHEMA_DOC = `
Canonical "Model" fields (TypeScript, from @basemodel/schema). Fields marked [required] must always be set:
- model_id: string [required] must match /^[a-z0-9-]+\\/[a-z0-9]+(?:[-.][a-z0-9]+)*$/ e.g. "cohere/command-r-plus" (provider slug / model slug)
- provider_id: string [required] e.g. "cohere"
- name: string [required] human-readable model name
- family: string (optional) e.g. "Command"
- version: string (optional)
- release_date: string (optional) YYYY-MM-DD
- description: string (optional)
- architecture: string (optional)
- parameter_size: string (optional) e.g. "70B"
- context_window: number (optional) in tokens
- modality: array of "text"|"image"|"audio"|"video"|"code"|"embedding" [required]
- open_weight: boolean [required]
- reasoning_support: boolean [required]
- function_calling: boolean [required]
- structured_output: boolean [required]
- vision_support: boolean [required]
- audio_support: boolean [required]
- image_generation: boolean [required]
- embedding_support: boolean [required]
- capability_ids: string[] (optional)
- license_id: string (optional)
- status: "active"|"preview"|"deprecated"|"discontinued" [required]
`;

const PLUGIN_CONTRACT = `
The plugin is a TypeScript module with a default export that satisfies CustomGateway:

import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

export default {
  type: 'custom',
  id: '<gateway-id>',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: '<gateway-id>', models: [], errors: [] };
    // ... fetch the catalog, parse with zod, map entries to partial Models ...
    return result;
  },
} satisfies CustomGateway;

Guidelines:
- Build the URL from the manifest's baseUrl + endpoint. Use only the secret names granted by the manifest.
- Validate the raw JSON with a zod schema; on parse failure push the error message to result.errors and return.
- Map each catalog entry to a Model. model_id must be "<gateway-id>/<slug>"; derive the slug from the provider's id/name using .toLowerCase() and replacing characters outside [a-z0-9.-] with '-', collapsing repeats.
- Set every required boolean field. Derive modality/capability flags from hints in the response (e.g. name/keywords like "embed", "image", "audio", "vision", "code") when available, otherwise default to text-only.
- Handle pagination if the response exposes it (next page URL / total counts); never loop forever (cap pages).
- Use AbortSignal.timeout(15_000) on fetch. Catch errors and push them to result.errors (do not throw).
- Never use the "any" type anywhere. Type catch variables as "unknown" and narrow with instanceof/typeof. Do not use "as any".
- Never hardcode real API keys; only reference secrets by their env names.
- Do not add code comments.
`;

function describeShape(shape: ShapeSummary, raw: unknown): string {
  const lines: string[] = ['Raw response shape summary:'];
  lines.push(`  top-level keys: ${JSON.stringify(shape.topLevel)}`);
  if (shape.modelArray) {
    lines.push(
      `  model array at "${shape.modelArray.path}" (${shape.modelArray.count} items), keys: ` +
        JSON.stringify(shape.modelArray.keys),
    );
    lines.push(`  example record: ${JSON.stringify(shape.modelArray.example, null, 2)}`);
  } else {
    lines.push('  no obvious array of models detected; inspect the raw sample.');
  }
  lines.push('');
  lines.push('Raw sample (truncated):');
  lines.push(JSON.stringify(raw, null, 2).slice(0, 6000));
  return lines.join('\n');
}

export function buildPluginPrompt(
  gateway: ManifestGateway,
  shape: ShapeSummary,
  raw: unknown,
): string {
  return [
    'You are writing a BaseModel gateway plugin in TypeScript. BaseModel collects a catalog of ',
    'AI models from provider APIs. Write a complete, compilable custom gateway plugin for the ',
    'provider described below.',
    '',
    'Gateway manifest entry:',
    JSON.stringify(
      {
        id: gateway.id,
        baseUrl: gateway.baseUrl,
        endpoint: gateway.endpoint,
        method: gateway.method,
        auth: gateway.auth,
        extraHeaders: gateway.extraHeaders,
        secrets: gateway.secrets,
      },
      null,
      2,
    ),
    '',
    MODEL_SCHEMA_DOC,
    '',
    PLUGIN_CONTRACT,
    '',
    describeShape(shape, raw),
    '',
    'Output ONLY the complete TypeScript file content. Do not wrap it in markdown fences, do not ',
    'add explanations or a leading title. The response must be valid TypeScript that can be ',
    'written verbatim to src/gateways/<gateway-id>.ts.',
  ].join('\n');
}

export function buildHealPrompt(
  gateway: ManifestGateway,
  shape: ShapeSummary,
  raw: unknown,
  currentCode: string,
  errors: string[],
): string {
  const errorBlock =
    errors.length > 0
      ? ['Validation errors to fix:', ...errors.map((error) => `- ${error}`)].join('\n')
      : 'No specific errors were provided; inspect the mapping carefully and fix anything that looks wrong.';

  return [
    'You previously generated a BaseModel gateway plugin for the provider below. It needs fixing.',
    '',
    'Gateway manifest entry:',
    JSON.stringify(
      {
        id: gateway.id,
        baseUrl: gateway.baseUrl,
        endpoint: gateway.endpoint,
        auth: gateway.auth,
        extraHeaders: gateway.extraHeaders,
        secrets: gateway.secrets,
      },
      null,
      2,
    ),
    '',
    MODEL_SCHEMA_DOC,
    '',
    PLUGIN_CONTRACT,
    '',
    errorBlock,
    '',
    'Current (broken) plugin:',
    '```ts',
    currentCode,
    '```',
    '',
    describeShape(shape, raw),
    '',
    'Output ONLY the complete corrected TypeScript file content. Do not wrap it in markdown ',
    'fences, do not add explanations.',
  ].join('\n');
}
