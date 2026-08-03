import { z } from 'zod';
import { fetchWithRetry } from '../../core/http.js';
import { toModelSlug } from '../../core/slug.js';

/**
 * OpenRouter — Aggregated pricing source.
 *
 * The public `/api/v1/models` endpoint exposes input/output pricing (USD per
 * token), context length, and free-model markers for hundreds of models across
 * many providers. This is the primary enrichment source for the registry.
 */

const OpenRouterModelSchema = z.object({
  id: z.string(),
  context_length: z.number().optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
});

const OpenRouterResponseSchema = z.object({
  data: z.array(OpenRouterModelSchema),
});

export interface OpenRouterModel {
  /** Full OpenRouter id, e.g. "openai/gpt-4o". */
  id: string;
  /**
   * Schema-normalized slug, computed with the same normalization the gateway
   * collector uses (see toModelSlug). Route suffixes such as "gpt-4o:free"
   * become "gpt-4o-free" so enrichment matches collected model ids exactly.
   */
  slug: string;
  /** Lowercased first path segment, e.g. "openai". */
  provider: string;
  contextLength?: number;
  /** Input cost in USD per 1M tokens. */
  inputPer1M?: number;
  /** Output cost in USD per 1M tokens. */
  outputPer1M?: number;
  isFree: boolean;
}

/** Converts OpenRouter's USD-per-token string into USD per 1M tokens. */
export function perTokenToPer1M(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number.parseFloat(value);
  // Negative pricing signals a variable/auto price (e.g. "auto" models).
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 1_000_000 * 1000) / 1000;
}

/** Fetches the OpenRouter model catalog and normalizes pricing. */
export async function fetchOpenRouterModels(
  apiKey?: string,
  baseUrl = 'https://openrouter.ai/api/v1/models',
): Promise<OpenRouterModel[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchWithRetry(baseUrl, { headers }, 4, 1000, 30_000);
  if (!response.ok) {
    throw new Error(`OpenRouter enrichment failed: HTTP ${response.status} ${response.statusText}`);
  }
  const parsed = OpenRouterResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`OpenRouter enrichment failed: invalid response (${parsed.error.message})`);
  }
  return parsed.data.data.map((model) => {
    const inputPer1M = perTokenToPer1M(model.pricing?.prompt);
    const outputPer1M = perTokenToPer1M(model.pricing?.completion);
    const segments = model.id.toLowerCase().split('/');
    const provider = segments.shift() ?? model.id;
    const slug = toModelSlug(model.id);
    return {
      id: model.id,
      slug,
      provider,
      contextLength: model.context_length,
      inputPer1M,
      outputPer1M,
      // Free only when both prices are explicitly zero. Models with unknown
      // or variable pricing (e.g. "auto" routes) are never marked free.
      isFree:
        inputPer1M !== undefined &&
        outputPer1M !== undefined &&
        inputPer1M === 0 &&
        outputPer1M === 0,
    };
  });
}
