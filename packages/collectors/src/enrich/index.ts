import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deleteRegistryFile,
  getAllModels,
  getAllPricing,
  listRegistryFiles,
  saveModel,
  savePricingRecords,
  writeRegistryFile,
} from '@basemodel/registry';
import type { Model, Pricing } from '@basemodel/schema';
import type { PricingSourceSpec } from '../core/collector.js';
import { describeGatewayPlugin } from '../core/runner.js';
import { toModelSlug } from '../core/slug.js';
import { classifyTier } from './classify.js';
import {
  fetchHuggingFaceModels,
  findHuggingFaceMatch,
  indexHuggingFace,
} from './sources/huggingface.js';
import { fetchOpenRouterModels, type OpenRouterModel } from './sources/openrouter.js';
import { fetchPricingCatalog, findPricingMatch, indexPricingCatalog } from './sources/provider.js';

export interface EnrichmentSummary {
  enrichedModels: number;
  pricingRecords: number;
  freeModels: number;
  errors: string[];
  huggingFaceModels: number;
  providerPricingModels: number;
  tierPropagated: number;
  reasoningFlagged: number;
  /** Percentage of models with economics (tier/free) after enrichment. */
  coveragePct: number;
  /** True when the primary pricing sources all failed and output is unusable. */
  fatal: boolean;
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

interface ProviderPricingCatalog {
  providerId: string;
  baseUrl?: string;
  secretKeyName?: string;
  source: PricingSourceSpec;
}

/**
 * Discovers gateways that declare a `pricingSource`, reading their plugin
 * descriptors through the same isolated worker used by collection. The enrich
 * step never imports a plugin module directly.
 */
async function discoverPricingCatalogs(): Promise<ProviderPricingCatalog[]> {
  const currentFile = fileURLToPath(import.meta.url);
  const gatewaysDirectory = path.join(path.dirname(currentFile), '..', 'gateways');
  if (!fs.existsSync(gatewaysDirectory)) return [];
  const files = fs
    .readdirSync(gatewaysDirectory)
    .filter((file) => (file.endsWith('.ts') || file.endsWith('.js')) && !file.startsWith('_'));

  const catalogs: ProviderPricingCatalog[] = [];
  for (const file of files) {
    try {
      const descriptor = await describeGatewayPlugin(path.join(gatewaysDirectory, file));
      if (descriptor.pricingSource) {
        catalogs.push({
          providerId: descriptor.id,
          baseUrl: descriptor.type === 'openai-compatible' ? descriptor.baseUrl : undefined,
          secretKeyName:
            descriptor.type === 'openai-compatible' ? descriptor.secretKeyName : undefined,
          source: descriptor.pricingSource,
        });
      }
    } catch {
      // Best-effort: an unreadable plugin is a collection concern, not enrichment.
    }
  }
  return catalogs;
}

function stripTilde(provider: string): string {
  return provider.replace(/^~/, '');
}

/** Region/deployment suffixes that identify a regional endpoint of a base model. */
const REGION_SUFFIX_RE = /-(eu|us|ap|sa|me|ca|global)(?:-[a-z0-9]+)*$/i;

/** Strips a trailing region suffix, e.g. "claude-fable-5-eu" -> "claude-fable-5". */
function stripRegionSuffix(slug: string): string {
  return slug.replace(REGION_SUFFIX_RE, '');
}

/** Router providers that re-serve upstream models; tier equals the source model. */
const ROUTER_PROVIDERS = new Set(['requesty', 'vercel', 'openrouter']);

/** Canonicalizes a model_id into a physical slug shared across providers. */
export function physicalSlug(modelId: string): string {
  const slug = toModelSlug(modelId.split('/').pop() ?? modelId);
  return stripRegionSuffix(slug.toLowerCase().replace(/\./g, '-'));
}

export interface TierPropagationResult {
  model: Model;
  source: Model;
}

/**
 * Propagates tiers to router aliases that re-serve an already-priced physical
 * model. Only the coarse tier and free flag are inherited; per-provider prices
 * are never fabricated because router markup differs from the upstream
 * provider.
 *
 * Prefers first-party (non-router) sources when multiple providers share the
 * same physical slug.
 */
export function propagateTiers(models: Model[]): TierPropagationResult[] {
  const byPhysicalSlug = new Map<string, Model[]>();
  for (const model of models) {
    const key = physicalSlug(model.model_id);
    const list = byPhysicalSlug.get(key) ?? [];
    list.push(model);
    byPhysicalSlug.set(key, list);
  }

  const results: TierPropagationResult[] = [];
  for (const model of models) {
    if (model.tier || model.is_free === true) continue;
    if (!ROUTER_PROVIDERS.has(model.provider_id)) continue;

    const key = physicalSlug(model.model_id);
    const candidates = byPhysicalSlug.get(key) ?? [];
    const source =
      candidates.find((candidate) => !ROUTER_PROVIDERS.has(candidate.provider_id)) ??
      candidates.find((candidate) => candidate.model_id !== model.model_id);
    if (!source) continue;

    // Only propagate when it changes the target's economics state; a router
    // alias may have been stripped of its tier during catalog matching.
    const sourceTier: Model['tier'] | undefined = source.is_free === true ? 'free' : source.tier;
    if (model.tier === sourceTier && model.is_free === source.is_free) continue;

    results.push({ model, source });
  }
  return results;
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
  if (candidates.length === 0) {
    // Fall back to the region-stripped slug so regional variants
    // (e.g. requesty/claude-fable-5-eu) inherit base-model pricing.
    const regionalSlug = stripRegionSuffix(slug);
    if (regionalSlug !== slug) {
      const regionalCandidates = index.bySlug.get(regionalSlug.toLowerCase()) ?? [];
      return (
        regionalCandidates.find((candidate) => !candidate.provider.startsWith('~')) ??
        regionalCandidates[0]
      );
    }
    return undefined;
  }

  const providerMatch = candidates.find(
    (candidate) => stripTilde(candidate.provider) === model.provider_id,
  );
  if (providerMatch) return providerMatch;

  const firstParty = candidates.find((candidate) => !candidate.provider.startsWith('~'));
  return firstParty ?? candidates[0];
}

function buildPricingRecords(model: Model, match: OpenRouterModel, source: string): Pricing[] {
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
      source,
    });
  };

  if (match.isFree) {
    records.push({
      pricing_id: `${model.provider_id}-${slug}-free`,
      model_id: model.model_id,
      pricing_type: 'free',
      value: 0,
      source,
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
 * Conservative heuristic for reasoning-capable models based on widely used
 * naming conventions (o1/o3/o4 series, "-r1", "thinking", "reasoning",
 * "reasoner"). This never fabricates prices or capabilities — it only fills a
 * flag collectors rarely report. Maintainers can refine the patterns.
 */
function inferReasoningSupport(model: Model): boolean {
  const text = `${model.name ?? ''} ${model.model_id}`.toLowerCase();
  if (/\bthinking\b/.test(text)) return true;
  if (/\breasoning\b/.test(text)) return true;
  if (/(^|[-_])(r1|reasoner|thinking)([-_]|$)/.test(text)) return true;
  if (/^[a-z0-9-]+\/(o1|o3|o4)[-_]/.test(model.model_id)) return true;
  return false;
}

/**
 * Runs the enrichment pipeline:
 * 1. Loads every model from the registry.
 * 2. Fetches pricing catalogs: per-gateway declared sources (provider's own
 *    prices), OpenRouter (aggregate primary), and Hugging Face Inference
 *    Providers (open-weight fallback).
 * 3. Matches each model to a catalog entry and derives tier, free status,
 *    limits, and pricing records.
 * 4. Propagates tiers to router aliases that re-serve an already-priced
 *    physical model (tier only; no fabricated per-provider prices).
 * 5. Persists updated models and regenerated pricing records.
 */
export async function runEnrichment(): Promise<EnrichmentSummary> {
  const summary: EnrichmentSummary = {
    enrichedModels: 0,
    pricingRecords: 0,
    freeModels: 0,
    errors: [],
    huggingFaceModels: 0,
    providerPricingModels: 0,
    tierPropagated: 0,
    reasoningFlagged: 0,
    coveragePct: 100,
    fatal: false,
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

  let catalog: OpenRouterModel[] = [];
  let openRouterFailed = false;
  try {
    catalog = await fetchOpenRouterModels(process.env.OPENROUTER_API_KEY);
  } catch (error: unknown) {
    // Do not return early: gateway-declared catalogs and Hugging Face may
    // still produce useful pricing. Fatal is decided once all sources ran.
    openRouterFailed = true;
    summary.errors.push(
      `Failed to fetch OpenRouter catalog: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Hugging Face Inference Providers is a best-effort secondary source.
  let hfIndex = new Map<string, Map<string, OpenRouterModel>>();
  try {
    const hfModels = await fetchHuggingFaceModels(
      process.env.BENCHMARKS_FETCH_TOKEN ?? process.env.HF_TOKEN,
    );
    hfIndex = indexHuggingFace(hfModels);
    summary.huggingFaceModels = hfModels.length;
  } catch (error: unknown) {
    summary.errors.push(
      `Failed to fetch HuggingFace catalog: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Gateways may declare their own pricing catalog (`pricingSource`). A
  // provider's own prices are the most accurate source for its models, so
  // these catalogs are fetched best-effort and matched before the aggregate
  // sources. Providers without a declared source simply skip this step.
  const providerIndexes = new Map<string, Map<string, OpenRouterModel[]>>();
  for (const { providerId, baseUrl, secretKeyName, source } of await discoverPricingCatalogs()) {
    try {
      const providerModels = await fetchPricingCatalog(
        source,
        secretKeyName ? process.env[secretKeyName] : undefined,
        baseUrl,
      );
      providerIndexes.set(providerId, indexPricingCatalog(providerModels));
      summary.providerPricingModels += providerModels.length;
    } catch (error: unknown) {
      summary.errors.push(
        `Failed to fetch ${providerId} pricing catalog: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const index = indexOpenRouter(catalog);
  const newPricing: Pricing[] = [];
  const enrichedModelIds = new Set<string>();
  const economicsModelIds = new Set<string>();
  const byModelId = new Map<string, Model>();
  for (const model of models) byModelId.set(model.model_id, model);
  let updated = 0;

  for (const model of models) {
    const providerIndex = providerIndexes.get(model.provider_id);
    let match: OpenRouterModel | undefined;
    let matchSource: 'provider' | 'openrouter' | 'huggingface' | undefined;
    if (providerIndex) {
      match = findPricingMatch(model, providerIndex);
      if (match) matchSource = 'provider';
    }
    if (!match) {
      match = findOpenRouterMatch(model, index);
      if (match) matchSource = 'openrouter';
    }
    if (!match) {
      match = findHuggingFaceMatch(model, hfIndex);
      if (match) matchSource = 'huggingface';
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
    // Provenance: name the exact source. For provider-declared catalogs the
    // source is the gateway id (e.g. "requesty"); for aggregates it is the
    // catalog name.
    const priceSource = matchSource === 'provider' ? model.provider_id : (matchSource ?? 'unknown');
    const pricing = buildPricingRecords(model, match, priceSource);

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
    byModelId.set(model.model_id, updatedModel);
    updated++;
    summary.enrichedModels++;

    if (updatedModel.tier || updatedModel.is_free === true) {
      economicsModelIds.add(updatedModel.model_id);
    }

    if (isFree) summary.freeModels++;
    if (pricing.length > 0) {
      newPricing.push(...pricing);
      enrichedModelIds.add(model.model_id);
    }
  }

  // Propagate tiers to router aliases (requesty/vercel/openrouter) that
  // re-serve an already-priced physical model. Only the coarse tier and
  // free flag are inherited; no per-provider price is fabricated because
  // router markup differs from the upstream provider.
  for (const { model, source } of propagateTiers([...byModelId.values()])) {
    const updatedModel: Model = {
      ...model,
      tier: source.tier,
      is_free: source.is_free,
    };
    await saveModel(updatedModel);
    byModelId.set(model.model_id, updatedModel);
    economicsModelIds.add(model.model_id);
    summary.tierPropagated++;
  }

  // Reasoning support is independent of pricing; fill the flag with the
  // conservative naming heuristic for every model (collectors rarely report
  // it directly).
  for (const model of models) {
    if (model.reasoning_support) continue;
    if (inferReasoningSupport(model)) {
      await saveModel({ ...model, reasoning_support: true });
      summary.reasoningFlagged++;
    }
  }

  // Merge: keep existing records for models we did not enrich, then
  // append newly derived records for enriched models. Records for models
  // that ended up with no economics (no tier and not free) are dropped so
  // the pricing registry stays consistent with the model registry.
  const allPricing = await getAllPricing();
  const merged = allPricing.filter(
    (record) => !enrichedModelIds.has(record.model_id) && economicsModelIds.has(record.model_id),
  );
  merged.push(...newPricing);
  summary.pricingRecords = merged.length;
  const byProvider = new Map<string, Pricing[]>();
  for (const record of merged) {
    const provider = record.model_id.split('/')[0] ?? 'unknown';
    const list = byProvider.get(provider) ?? [];
    list.push(record);
    byProvider.set(provider, list);
  }

  // Write each provider's pricing file directly (each write is atomic).
  // Then clean up stale providers that are no longer enriched.
  const writtenProviders = new Set<string>();
  for (const [provider, records] of byProvider) {
    await savePricingRecords(provider, records);
    writtenProviders.add(provider);
  }
  for (const file of await listRegistryFiles('pricing')) {
    const providerName = file.replace(/\.json$/, '');
    if (!writtenProviders.has(providerName)) {
      await deleteRegistryFile(`pricing/${file}`);
    }
  }

  console.log(`Enriched ${summary.enrichedModels} models (${updated} saved)`);
  console.log(`  free models        : ${summary.freeModels}`);
  console.log(`  provider catalogs  : ${summary.providerPricingModels}`);
  console.log(`  HF catalog models  : ${summary.huggingFaceModels}`);
  console.log(`  tier propagated    : ${summary.tierPropagated}`);
  console.log(
    `  pricing            : ${summary.pricingRecords} records across ${byProvider.size} providers`,
  );

  // Fail loudly: when the primary pricing sources are all unavailable the
  // enriched output would silently mislead consumers. Surface it in the
  // summary, persist it to meta.json, and let the CLI exit non-zero.
  // Fail loud: all pricing sources down, OR economics coverage collapsed.
  // A CI failure here (via the CLI exit code) makes degraded data visible
  // instead of shipping quietly.
  const coveragePct = models.length > 0 ? (economicsModelIds.size / models.length) * 100 : 100;
  summary.coveragePct = Math.round(coveragePct * 10) / 10;
  summary.fatal =
    (openRouterFailed && summary.providerPricingModels === 0 && summary.huggingFaceModels === 0) ||
    summary.coveragePct < 50;
  if (summary.fatal) {
    summary.errors.push(
      `Economics coverage too low (${summary.coveragePct}% of ${models.length} models); treating output as unhealthy.`,
    );
  }
  await writeRegistryFile('meta.json', {
    generated_at: new Date().toISOString(),
    fatal: summary.fatal,
    sources: {
      openrouter: openRouterFailed ? 'failed' : 'ok',
      provider_pricing_models: summary.providerPricingModels,
      huggingface_models: summary.huggingFaceModels,
    },
    coverage: {
      total_models: models.length,
      tiered_models: economicsModelIds.size,
      pct: summary.coveragePct,
    },
    errors: summary.errors,
  });

  if (summary.fatal) {
    console.error('❌ Enrichment FATAL: all primary pricing sources failed.');
  } else if (summary.errors.length > 0) {
    console.warn('Enrichment errors:', summary.errors);
  }
  return summary;
}
