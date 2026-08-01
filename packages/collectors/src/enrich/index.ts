import {
  clearPricingRegistry,
  getAllModels,
  getAllPricing,
  saveModel,
  savePricingRecords,
} from '@basemodel/registry';
import type { Model, Pricing } from '@basemodel/schema';
import { toModelSlug } from '../core/slug.js';
import { classifyTier } from './classify.js';
import { fetchOpenRouterModels, type OpenRouterModel } from './sources/openrouter.js';

/** Marks pricing records captured directly from a provider's API at collection time. */
export const PROVIDER_PRICING_SOURCE = 'source: provider-api';
/** Marks pricing records derived from the OpenRouter aggregate catalog. */
export const OPENROUTER_PRICING_SOURCE = 'source: openrouter';

export interface EnrichmentSummary {
  enrichedModels: number;
  pricingRecords: number;
  freeModels: number;
  errors: string[];
}

/** Builds an exact-id lookup and a slug lookup from the OpenRouter catalog. */
function indexOpenRouter(models: OpenRouterModel[]): {
  byId: Map<string, OpenRouterModel>;
  bySlug: Map<string, OpenRouterModel[]>;
} {
  const byId = new Map<string, OpenRouterModel>();
  const bySlug = new Map<string, OpenRouterModel[]>();
  for (const entry of models) {
    byId.set(entry.id.toLowerCase(), entry);
    const slugList = bySlug.get(entry.slug) ?? [];
    slugList.push(entry);
    bySlug.set(entry.slug, slugList);
  }
  return { byId, bySlug };
}

function stripTilde(provider: string): string {
  return provider.replace(/^~/, '');
}

/**
 * Finds the best OpenRouter entry for a registry model.
 *
 * Priority:
 * 1. Exact `{provider}/{slug}` id match (non-community `~` variants preferred).
 * 2. Any entry whose slug matches, preferring entries whose provider matches
 *    the model's provider_id, then non-`~` community variants.
 */
export function findOpenRouterMatch(
  model: Model,
  index: { byId: Map<string, OpenRouterModel>; bySlug: Map<string, OpenRouterModel[]> },
): OpenRouterModel | undefined {
  const slug = toModelSlug(model.model_id.split('/').pop() ?? model.model_id);
  const exactId = `${model.provider_id}/${slug}`.toLowerCase();

  const exact = index.byId.get(exactId);
  if (exact) return exact;
  const exactTilde = index.byId.get(`~${exactId}`);
  if (exactTilde) return exactTilde;

  const candidates = index.bySlug.get(slug.toLowerCase()) ?? [];
  if (candidates.length === 0) return undefined;

  const providerMatch = candidates.find(
    (candidate) => stripTilde(candidate.provider) === model.provider_id,
  );
  if (providerMatch) return providerMatch;

  const firstParty = candidates.find((candidate) => !candidate.provider.startsWith('~'));
  return firstParty ?? candidates[0];
}

function buildPricingRecords(model: Model, match: OpenRouterModel): Pricing[] {
  const slug = model.model_id.split('/').pop() ?? model.model_id;
  const records: Pricing[] = [];

  if (match.isFree) {
    records.push({
      pricing_id: `${model.provider_id}-${slug}-free`,
      model_id: model.model_id,
      pricing_type: 'free',
      value: 0,
      notes: OPENROUTER_PRICING_SOURCE,
    });
    return records;
  }

  if (match.inputPer1M !== undefined) {
    records.push({
      pricing_id: `${model.provider_id}-${slug}-input`,
      model_id: model.model_id,
      pricing_type: 'input-token',
      currency: 'USD',
      unit: '1M tokens',
      value: match.inputPer1M,
      notes: OPENROUTER_PRICING_SOURCE,
    });
  }
  if (match.outputPer1M !== undefined) {
    records.push({
      pricing_id: `${model.provider_id}-${slug}-output`,
      model_id: model.model_id,
      pricing_type: 'output-token',
      currency: 'USD',
      unit: '1M tokens',
      value: match.outputPer1M,
      notes: OPENROUTER_PRICING_SOURCE,
    });
  }
  return records;
}

function buildLimits(match: OpenRouterModel): Model['limits'] {
  const limits: Model['limits'] = {};
  if (match.contextLength !== undefined) {
    limits.max_input_tokens = match.contextLength;
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
}

interface ProviderPricingInfo {
  inputPer1M?: number;
  outputPer1M?: number;
  isFree: boolean;
}

/**
 * Builds a model_id → pricing map from pricing records captured directly from
 * provider APIs during collection (see runner.persistProviderPricing). These
 * are used as a secondary source for models the OpenRouter catalog does not cover.
 */
export function indexProviderPricing(
  records: readonly Pricing[],
): Map<string, ProviderPricingInfo> {
  const byModel = new Map<string, ProviderPricingInfo>();
  for (const record of records) {
    if (record.notes !== PROVIDER_PRICING_SOURCE) continue;
    const entry = byModel.get(record.model_id) ?? { isFree: false };
    if (record.pricing_type === 'free') entry.isFree = true;
    else if (record.pricing_type === 'input-token') entry.inputPer1M = record.value;
    else if (record.pricing_type === 'output-token') entry.outputPer1M = record.value;
    byModel.set(record.model_id, entry);
  }
  return byModel;
}

/**
 * Applies economics (is_free/tier) to a model from a secondary pricing source
 * when OpenRouter has no match.
 */
async function applyProviderPricing(model: Model, info: ProviderPricingInfo): Promise<void> {
  const classified = classifyTier(info.inputPer1M ?? 0, info.outputPer1M ?? 0);
  const isFree = info.isFree;
  const tier: Model['tier'] = isFree
    ? 'free'
    : classified.tier === 'free'
      ? undefined
      : classified.tier;
  await saveModel({ ...model, is_free: isFree, tier });
}

/**
 * Runs the enrichment pipeline:
 * 1. Loads every model from the registry.
 * 2. Fetches OpenRouter's aggregated pricing catalog.
 * 3. Matches each model to a catalog entry and derives tier, free status,
 *    limits, and pricing records.
 * 4. Persists updated models and regenerated pricing records.
 */
export async function runEnrichment(): Promise<EnrichmentSummary> {
  const summary: EnrichmentSummary = {
    enrichedModels: 0,
    pricingRecords: 0,
    freeModels: 0,
    errors: [],
  };

  let models: Model[];
  try {
    models = await getAllModels();
  } catch (error: unknown) {
    summary.errors.push(
      `Failed to load models: ${error instanceof Error ? error.message : String(error)}`,
    );
    return summary;
  }

  let catalog: OpenRouterModel[];
  try {
    catalog = await fetchOpenRouterModels(process.env.OPENROUTER_API_KEY);
  } catch (error: unknown) {
    summary.errors.push(
      `Failed to fetch OpenRouter catalog: ${error instanceof Error ? error.message : String(error)}`,
    );
    return summary;
  }

  const index = indexOpenRouter(catalog);
  const existingPricing = await getAllPricing();
  const providerPricing = indexProviderPricing(existingPricing);
  const newPricing: Pricing[] = [];
  const enrichedModelIds = new Set<string>();
  let updated = 0;

  for (const model of models) {
    const match = findOpenRouterMatch(model, index);
    const providerInfo = providerPricing.get(model.model_id);
    // An OpenRouter entry is authoritative only for exact same-provider ids.
    // Slug-fallback matches can point at a *different* provider's entry
    // (e.g. requesty/mistral-x falling back to OpenRouter's mistral/x), so a
    // provider's own captured pricing wins over those.
    const exactOpenRouter = match !== undefined && stripTilde(match.provider) === model.provider_id;

    if (providerInfo && !exactOpenRouter) {
      // Provider's own API pricing is the most accurate signal.
      await applyProviderPricing(model, providerInfo);
      updated++;
      summary.enrichedModels++;
      if (providerInfo.isFree) summary.freeModels++;
      continue;
    }

    if (!match) continue;

    const hasPricing = match.inputPer1M !== undefined || match.outputPer1M !== undefined;
    const classified = classifyTier(match.inputPer1M ?? 0, match.outputPer1M ?? 0);
    const isFree = match.isFree;
    // A model with one unknown price can produce a false "free" from the
    // classifier (missing price defaults to 0). Never label those free.
    const tier: Model['tier'] = isFree
      ? 'free'
      : classified.tier === 'free'
        ? undefined
        : classified.tier;
    const limits = buildLimits(match);
    const pricing = buildPricingRecords(model, match);

    const updatedModel: Model = {
      ...model,
      // Only persist economics when the catalog reports pricing; otherwise
      // drop stale flags from earlier runs.
      is_free: hasPricing ? isFree : undefined,
      tier: hasPricing ? tier : undefined,
      limits,
      context_window: model.context_window ?? match.contextLength,
    };

    await saveModel(updatedModel);
    updated++;
    summary.enrichedModels++;

    if (isFree) summary.freeModels++;
    if (pricing.length > 0) {
      newPricing.push(...pricing);
      enrichedModelIds.add(model.model_id);
    }
  }

  // Merge: replace records for OpenRouter-enriched models, keep only
  // provider-captured records for models priced from their own API, and
  // preserve anything else untouched.
  const merged = existingPricing.filter((record) => {
    if (enrichedModelIds.has(record.model_id)) return false;
    if (providerPricing.has(record.model_id)) return record.notes === PROVIDER_PRICING_SOURCE;
    return true;
  });
  merged.push(...newPricing);
  summary.pricingRecords = merged.length;

  const byProvider = new Map<string, Pricing[]>();
  for (const record of merged) {
    const provider = record.model_id.split('/')[0] ?? 'unknown';
    const list = byProvider.get(provider) ?? [];
    list.push(record);
    byProvider.set(provider, list);
  }

  await clearPricingRegistry();
  for (const [provider, records] of byProvider) {
    await savePricingRecords(provider, records);
  }

  console.log(`Enriched ${summary.enrichedModels} models (${updated} saved)`);
  console.log(`  free models  : ${summary.freeModels}`);
  console.log(
    `  pricing      : ${summary.pricingRecords} records across ${byProvider.size} providers`,
  );
  if (summary.errors.length > 0) {
    console.warn('Enrichment errors:', summary.errors);
  }
  return summary;
}
