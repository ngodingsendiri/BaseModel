import type { Model } from '@basemodel/schema';
import { z } from 'zod';
import { toModelSlug } from '../../core/slug.js';
import type { OpenRouterModel } from './openrouter.js';

/**
 * Hugging Face Inference Providers — secondary pricing source.
 *
 * The public OpenAI-compatible catalog at `router.huggingface.co/v1/models`
 * lists open-weight models served by partner backends (deepinfra, groq,
 * novita, together, ...) with per-provider pricing in USD per 1M tokens. It
 * only covers open-weight models, so it is used as a fallback when the
 * OpenRouter catalog has no entry. No auth token is required.
 */

const PricingSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
});

const ProviderSchema = z.object({
  provider: z.string(),
  status: z.string().optional(),
  context_length: z.number().optional(),
  pricing: PricingSchema.optional(),
  is_free: z.boolean().optional(),
});

const EntrySchema = z.object({
  id: z.string(),
  providers: z.array(ProviderSchema).optional(),
});

const HuggingFaceResponseSchema = z.object({
  data: z.array(EntrySchema),
});

export interface HuggingFaceModel {
  /** Full HF model id, e.g. "deepseek-ai/DeepSeek-V3-0324". */
  id: string;
  /** Schema-normalized slug of the last path segment, e.g. "deepseek-v3-0324". */
  slug: string;
  providers: HuggingFaceProvider[];
}

export interface HuggingFaceProvider {
  /** Partner backend name, e.g. "deepinfra". */
  name: string;
  contextLength?: number;
  /** Input cost in USD per 1M tokens. */
  inputPer1M?: number;
  /** Output cost in USD per 1M tokens. */
  outputPer1M?: number;
  isFree: boolean;
}

/** Canonicalizes a slug for HF matching by collapsing dot/dash variants. */
function hfSlug(apiId: string): string {
  return toModelSlug(apiId.split('/').pop() ?? apiId).replace(/\./g, '-');
}

/** Fetches the Hugging Face Inference Providers catalog. */
export async function fetchHuggingFaceModels(
  apiKey?: string,
  baseUrl = 'https://router.huggingface.co/v1/models',
): Promise<HuggingFaceModel[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(baseUrl, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(
      `HuggingFace enrichment failed: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const parsed = HuggingFaceResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`HuggingFace enrichment failed: invalid response (${parsed.error.message})`);
  }
  return parsed.data.data.map((model) => ({
    id: model.id,
    slug: hfSlug(model.id),
    providers: (model.providers ?? [])
      .filter((provider) => provider.status === 'live')
      .map((provider) => ({
        name: provider.provider,
        contextLength: provider.context_length,
        inputPer1M: provider.pricing?.input,
        outputPer1M: provider.pricing?.output,
        isFree: provider.pricing?.input === 0 && provider.pricing?.output === 0,
      })),
  }));
}

/** HF partner backend names that correspond to each registry provider_id. */
const HF_PROVIDER_ALIASES: Record<string, string[]> = {
  deepinfra: ['deepinfra'],
  groq: ['groq'],
  cerebras: ['cerebras'],
  hyperbolic: ['hyperbolic'],
  meta: ['meta'],
  openai: ['openai'],
  google: ['google'],
  'mistral-ai': ['mistralai', 'mistral'],
  mistralai: ['mistralai', 'mistral'],
};

/** Builds a slug -> backend -> priced entry lookup from the HF catalog. */
export function indexHuggingFace(
  models: HuggingFaceModel[],
): Map<string, Map<string, OpenRouterModel>> {
  const index = new Map<string, Map<string, OpenRouterModel>>();
  for (const model of models) {
    const byBackend = index.get(model.slug) ?? new Map<string, OpenRouterModel>();
    for (const provider of model.providers) {
      byBackend.set(provider.name, {
        id: model.id,
        slug: model.slug,
        provider: provider.name,
        contextLength: provider.contextLength,
        inputPer1M: provider.inputPer1M,
        outputPer1M: provider.outputPer1M,
        isFree: provider.isFree,
      });
    }
    index.set(model.slug, byBackend);
  }
  return index;
}

/** Finds the HF-priced entry for a registry model served by its own provider. */
export function findHuggingFaceMatch(
  model: Model,
  index: Map<string, Map<string, OpenRouterModel>>,
): OpenRouterModel | undefined {
  const slug = hfSlug(model.model_id.split('/').pop() ?? model.model_id);
  const byBackend = index.get(slug);
  if (!byBackend) return undefined;
  const aliases = HF_PROVIDER_ALIASES[model.provider_id] ?? [model.provider_id];
  for (const alias of aliases) {
    const entry = byBackend.get(alias);
    // Only match entries that actually report pricing. A backend that serves
    // the model without a pricing block must not clear an existing tier.
    if (entry && (entry.inputPer1M !== undefined || entry.outputPer1M !== undefined)) {
      return entry;
    }
  }
  return undefined;
}
