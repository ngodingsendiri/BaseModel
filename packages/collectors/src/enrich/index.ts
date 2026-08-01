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
  const push = (pricingType: 'input-token' | 'output-token', value: number): void => {
    records.push({
      pricing_id: `${model.provider_id}-${slug}-${pricingType === 'input-token' ? 'input' : 'output'}`,
      model_id: model.model_id,
      pricing_type: pricingType,
      currency: 'USD',
      unit: '1M tokens',
      value,
    });
  };

  if (match.isFree) {
    records.push({
      pricing_id: `${model.provider_id}-${slug}-free`,
      model_id: model.model_id,
      pricing_type: 'free',
      value: 0,
    });
    return records;
  }

  if (match.inputPer1M !== undefined) push('input-token', match.inputPer1M);
  if (match.outputPer1M !== undefined) push('output-token', match.outputPer1M);
  return records;
}

function buildLimits(match: OpenRouterModel): Model['limits'] {
  const limits: Model['limits'] = {};
  if (match.contextLength !== undefined) {
    limits.max_input_tokens = match.contextLength;
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
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
  const newPricing: Pricing[] = [];
  const enrichedModelIds = new Set<string>();
  let updated = 0;

  for (const model of models) {
    const match = findOpenRouterMatch(model, index);
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

  // Merge: keep existing records for models we did not enrich, then
  // append newly derived records for enriched models.
  const allPricing = await getAllPricing();
  const merged = allPricing.filter((record) => !enrichedModelIds.has(record.model_id));
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
