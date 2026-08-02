import type { Model } from '@basemodel/schema';
import { z } from 'zod';
import { toModelSlug } from '../../core/slug.js';
import type { OpenRouterModel } from './openrouter.js';

/**
 * Requesty — AI model router with cost optimization.
 *
 * The public `/v1/models` endpoint lists every model Requesty can route,
 * including per-token `input_price`/`output_price`, context length, and
 * capability flags. Because these are Requesty's own resale prices, they are
 * the most accurate source for `requesty/*` models. No auth token is required.
 */

const PricingTierSchema = z.object({
  prompt_tokens_threshold: z.number().optional(),
  input_price: z.number().optional(),
  cached_price: z.number().optional(),
  output_price: z.number().optional(),
});

const RequestyModelSchema = z.object({
  id: z.string(),
  input_price: z.number().optional(),
  output_price: z.number().optional(),
  pricing: z.array(PricingTierSchema).optional(),
  context_window: z.number().optional(),
  max_output_tokens: z.number().optional(),
});

const RequestyResponseSchema = z.object({
  data: z.array(RequestyModelSchema),
});

/** Region/deployment suffixes that identify a regional endpoint of a base model. */
const REGION_SUFFIX_RE = /-(eu|us|ap|sa|me|ca|global)(?:-[a-z0-9]+)*$/i;

/** Strips a trailing region suffix, e.g. "claude-fable-5-eu" -> "claude-fable-5". */
function stripRegionSuffix(slug: string): string {
  return slug.replace(REGION_SUFFIX_RE, '');
}

/** USD-per-token cost into USD per 1M tokens, matching OpenRouter's unit. */
function perTokenToPer1M(value: number | undefined): number | undefined {
  if (value === undefined || value < 0) return undefined;
  return Math.round(value * 1_000_000 * 1000) / 1000;
}

/** Fetches the Requesty model catalog and normalizes pricing. */
export async function fetchRequestyModels(
  apiKey?: string,
  baseUrl = 'https://router.requesty.ai/v1/models',
): Promise<OpenRouterModel[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(baseUrl, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Requesty enrichment failed: HTTP ${response.status} ${response.statusText}`);
  }
  const parsed = RequestyResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Requesty enrichment failed: invalid response (${parsed.error.message})`);
  }
  return parsed.data.data.map((model) => {
    const inputPer1M = perTokenToPer1M(model.input_price);
    const outputPer1M = perTokenToPer1M(model.output_price);
    return {
      id: model.id,
      slug: toModelSlug(model.id),
      provider: 'requesty',
      contextLength: model.context_window,
      inputPer1M,
      outputPer1M,
      isFree: inputPer1M === 0 && outputPer1M === 0,
    };
  });
}

/** Builds a slug lookup from the Requesty catalog, keyed by exact slug. */
export function indexRequesty(models: OpenRouterModel[]): Map<string, OpenRouterModel[]> {
  const bySlug = new Map<string, OpenRouterModel[]>();
  for (const entry of models) {
    const list = bySlug.get(entry.slug) ?? [];
    list.push(entry);
    bySlug.set(entry.slug, list);
  }
  return bySlug;
}

/** Finds the Requesty-priced entry for a registry model. */
export function findRequestyMatch(
  model: Model,
  index: Map<string, OpenRouterModel[]>,
): OpenRouterModel | undefined {
  const slug = toModelSlug(model.model_id.split('/').pop() ?? model.model_id);
  const exact = index.get(slug) ?? [];
  if (exact.length > 0) return exact[0];

  // Fall back to the region-stripped slug for regional endpoints whose base
  // model is priced (e.g. requesty/claude-haiku-4-5-eu -> claude-haiku-4-5).
  const regionalSlug = stripRegionSuffix(slug);
  if (regionalSlug !== slug) {
    const regional = index.get(regionalSlug) ?? [];
    if (regional.length > 0) return regional[0];
  }
  return undefined;
}
