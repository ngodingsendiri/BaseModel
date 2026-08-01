import type { ManifestGateway } from './manifest.js';
import type { ShapeSummary } from './probe.js';

const MODEL_SCHEMA_DOC = `
Canonical "Model" type (TypeScript, from @basemodel/schema). Each catalog entry must map to an object satisfying this shape:
type Model = {
  model_id: string;            // [required] matches /^[a-z0-9-]+\\/[a-z0-9]+(?:[-.][a-z0-9]+)*$/  e.g. "cohere/command-r-plus"
  provider_id: string;         // [required] e.g. "cohere"
  name: string;                // [required] human-readable name
  family?: string;
  version?: string;
  release_date?: string;       // ISO YYYY-MM-DD
  description?: string;
  architecture?: string;
  parameter_size?: string;
  context_window?: number;     // positive integer (tokens); omit when unknown
  modality: ('text'|'image'|'audio'|'video'|'code'|'embedding')[];  // [required]
  open_weight: boolean;        // [required]
  reasoning_support: boolean;  // [required]
  function_calling: boolean;   // [required]
  structured_output: boolean;  // [required]
  vision_support: boolean;     // [required]
  audio_support: boolean;      // [required]
  image_generation: boolean;   // [required]
  embedding_support: boolean;  // [required]
  is_free?: boolean;
  tier?: 'free'|'budget'|'balanced'|'premium';
  limits?: object;             // omit unless you have exact pricing/limits data
  capability_ids?: string[];   // defaults to []
  license_id?: string;
  status: 'active'|'preview'|'deprecated'|'discontinued';  // [required]
};
Rules:
- Set every required field; every key must be spelled exactly as above (this is a strict TS type).
- When a source value is null or missing, OMIT the optional field (or map to undefined) - never assign null.
- context_window must be a positive integer or absent - never null, never 0.
- Derive modality from source hints (e.g. "embed" -> 'embedding'); default to ['text'].
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
- The raw response zod schema must describe ONLY what the API actually returns, using permissive types: numbers may be null or 0, arrays may be null, strings may be absent. Do NOT copy the BaseModel Model constraints above (model_id regex, positive context_window, status/modality enums) into the raw response schema - those apply ONLY when building the output Model objects.
- Validate the raw JSON with a zod schema; on parse failure push a short message to result.errors and return.
- Map each catalog entry to a Model. model_id must be "<gateway-id>/<slug>"; derive the slug from the provider's id/name using .toLowerCase() and replacing characters outside [a-z0-9.-] with '-', collapsing repeats.
- Use this exact slugify helper (the two-argument form of .replace is required, otherwise typecheck fails with TS2554):
    function slugify(text: string): string {
      return text.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
- Set every required boolean field. Derive modality/capability flags from hints in the response (e.g. name/keywords like "embed", "image", "audio", "vision", "code") when available, otherwise default to text-only.
- When building a Model, map raw context_length to context_window ONLY if it is a positive integer; otherwise omit context_window entirely.
- Raw nullable fields (e.g. features or endpoints that can be null) must be normalized before passing to helpers: write const features = raw.features ?? undefined and pass the normalized value, or type the helper parameter as 'string[] | null | undefined'. Never pass a string[] | null | undefined value to a parameter typed string[] | undefined.
- Handle pagination if the response exposes it (next page URL / total counts); never loop forever (cap pages).
- Use AbortSignal.timeout(15_000) on fetch. Catch errors and push them to result.errors (do not throw).
- Never use the "any" type anywhere. Type catch variables as "unknown" and narrow with instanceof/typeof. Do not use "as any".
- Do not declare unused variables or helper functions; every declared name must be referenced, or the file fails typecheck (noUnusedLocals).
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
