import type { Model } from '@basemodel/schema';
import type { PricingSourceSpec } from '../../core/collector.js';
import { fetchWithRetry } from '../../core/http.js';
import { toModelSlug } from '../../core/slug.js';
import type { OpenRouterModel } from './openrouter.js';

/**
 * Generic pricing catalog for OpenAI-compatible gateways.
 *
 * The enrich step reads the `pricingSource` declared on a gateway plugin and
 * fetches its model list to price the models collected from that provider.
 * Providers that publish their own machine-readable prices (for example
 * Requesty's `https://router.requesty.ai/v1/models`) declare a source here;
 * providers without one keep relying on the aggregate catalogs.
 */

/** Region/deployment suffixes that identify a regional endpoint of a base model. */
const REGION_SUFFIX_RE = /-(eu|us|ap|sa|me|ca|global)(?:-[a-z0-9]+)*$/i;

/** Strips a trailing region suffix, e.g. "claude-fable-5-eu" -> "claude-fable-5". */
function stripRegionSuffix(slug: string): string {
  return slug.replace(REGION_SUFFIX_RE, '');
}

/** Reads a dotted path from a JSON value, e.g. `pricing.prompt`. */
export function getPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Converts a price field (per-token or per-1M, numeric or string) to USD per 1M tokens. */
function toPer1M(value: unknown, unit: 'per-token' | 'per-1m'): number | undefined {
  let parsed: number | undefined;
  if (typeof value === 'number') parsed = value;
  else if (typeof value === 'string') parsed = Number.parseFloat(value);
  if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0) return undefined;
  return unit === 'per-token' ? Math.round(parsed * 1_000_000 * 1000) / 1000 : parsed;
}

/** Normalizes a single catalog entry against a pricing source spec. */
export function parsePricingEntry(item: unknown, spec: PricingSourceSpec): OpenRouterModel {
  const idValue = getPath(item, spec.idField ?? 'id');
  const id = typeof idValue === 'string' ? idValue : '';
  const inputPer1M = toPer1M(
    getPath(item, spec.inputPriceField ?? 'input_price'),
    spec.pricingUnit ?? 'per-token',
  );
  const outputPer1M = toPer1M(
    getPath(item, spec.outputPriceField ?? 'output_price'),
    spec.pricingUnit ?? 'per-token',
  );
  const contextValue = getPath(item, spec.contextField ?? 'context_window');
  const contextLength = typeof contextValue === 'number' ? contextValue : undefined;
  return {
    id,
    slug: toModelSlug(id),
    provider: 'provider-catalog',
    contextLength,
    inputPer1M,
    outputPer1M,
    // Free only when both prices are explicitly zero. A missing price yields
    // undefined, which never equals 0, so unlisted prices stay unpriced.
    isFree: inputPer1M === 0 && outputPer1M === 0,
  };
}

/** Fetches a gateway's declared pricing catalog and normalizes its entries. */
export async function fetchPricingCatalog(
  source: PricingSourceSpec,
  apiKey?: string,
  baseUrl?: string,
): Promise<OpenRouterModel[]> {
  const url = source.url ?? `${baseUrl ?? ''}/models`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (source.auth === 'secret' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchWithRetry(url, { headers }, 4, 1000, 30_000);
  if (!response.ok) {
    throw new Error(`Pricing catalog failed: HTTP ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as unknown;
  const items = getPath(body, source.itemsPath ?? 'data');
  if (!Array.isArray(items)) {
    throw new Error('Pricing catalog returned no items array.');
  }
  return items.map((item) => parsePricingEntry(item, source));
}

/** Builds a slug lookup from a provider pricing catalog. */
export function indexPricingCatalog(models: OpenRouterModel[]): Map<string, OpenRouterModel[]> {
  const bySlug = new Map<string, OpenRouterModel[]>();
  for (const entry of models) {
    const list = bySlug.get(entry.slug) ?? [];
    list.push(entry);
    bySlug.set(entry.slug, list);
  }
  return bySlug;
}

/** Finds the provider-priced entry for a registry model of that provider. */
export function findPricingMatch(
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
