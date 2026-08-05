import type { Benchmark, CanonicalModel, Model, Quality } from '@basemodel/schema';

/**
 * Entity resolution for the v2 data model.
 *
 * Groups v1 offerings (one record per provider serve) into canonical
 * physical models. Resolution is deterministic: offerings are grouped by
 * their normalized slug, and the canonical record merges their attributes
 * (modality union, flag OR, best context window, first-party name).
 *
 * Curated alias overrides belong in the curation overlay; this module only
 * implements the automatic, high-confidence path.
 */

/** Providers that re-serve upstream models rather than hosting their own. */
const ROUTER_PROVIDER_SET = new Set(['openrouter', 'requesty', 'vercel', 'portkey']);

/** Normalizes an offering or benchmark id to a canonical slug. */
export function canonicalSlug(id: string): string {
  const slug = id.includes('/') ? (id.split('/').pop() ?? id) : id;
  return slug.replace(/\./g, '-').toLowerCase();
}

const STATUS_PRIORITY: Record<CanonicalModel['status'], number> = {
  active: 0,
  preview: 1,
  deprecated: 2,
  discontinued: 3,
};

export interface ResolutionResult {
  canonicals: CanonicalModel[];
  /** offering id ({provider}/{slug}) -> canonical model id. */
  mapping: Map<string, string>;
}

/** Picks the first defined value across offerings, representatives first. */
function pickFirst<K extends keyof Model>(offerings: Model[], field: K): Model[K] | undefined {
  for (const offering of offerings) {
    const value = offering[field];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/**
 * Resolves v1 offerings into canonical models.
 * Deterministic: stable ordering for both groups and merged fields.
 */
export function resolveCanonicalModels(models: Model[]): ResolutionResult {
  const groups = new Map<string, Model[]>();
  for (const model of models) {
    const key = canonicalSlug(model.model_id);
    const list = groups.get(key) ?? [];
    list.push(model);
    groups.set(key, list);
  }

  const canonicals: CanonicalModel[] = [];
  const mapping = new Map<string, string>();

  for (const slug of [...groups.keys()].sort()) {
    const offerings = groups.get(slug);
    if (!offerings || offerings.length === 0) continue;

    // Representatives first: non-router providers, then stable provider order.
    const sorted = [...offerings].sort((a, b) => {
      const aRouter = ROUTER_PROVIDER_SET.has(a.provider_id) ? 1 : 0;
      const bRouter = ROUTER_PROVIDER_SET.has(b.provider_id) ? 1 : 0;
      if (aRouter !== bRouter) return aRouter - bRouter;
      return a.provider_id.localeCompare(b.provider_id);
    });
    const representative = sorted[0] as Model;

    // Modality union in first-seen order.
    const modality: CanonicalModel['modality'] = [];
    for (const offering of sorted) {
      for (const m of offering.modality) {
        if (!modality.includes(m)) modality.push(m);
      }
    }

    const contextWindow = sorted.reduce<number | undefined>((best, offering) => {
      if (!offering.context_window) return best;
      return best === undefined ? offering.context_window : Math.max(best, offering.context_window);
    }, undefined);

    const capabilityIds = [...new Set(sorted.flatMap((o) => o.capability_ids ?? []))].sort();

    const status = sorted.reduce<CanonicalModel['status']>(
      (best, offering) =>
        STATUS_PRIORITY[offering.status] < STATUS_PRIORITY[best] ? offering.status : best,
      'discontinued',
    );

    // Raw upstream slugs (dots preserved, e.g. "gemini-2.5-pro") so
    // consumers can match pre-normalization ids; canonical ids normalize
    // dots to dashes.
    const rawAliases = [
      ...new Set(sorted.map((o) => (o.model_id.split('/').pop() ?? o.model_id).toLowerCase())),
    ].sort();

    canonicals.push({
      model_id: slug,
      name: pickFirst(sorted, 'name') ?? representative.model_id,
      family: pickFirst(sorted, 'family'),
      description: pickFirst(sorted, 'description'),
      release_date: pickFirst(sorted, 'release_date'),
      modality,
      open_weight: sorted.some((o) => o.open_weight),
      reasoning_support: sorted.some((o) => o.reasoning_support),
      function_calling: sorted.some((o) => o.function_calling),
      structured_output: sorted.some((o) => o.structured_output),
      vision_support: sorted.some((o) => o.vision_support),
      audio_support: sorted.some((o) => o.audio_support),
      image_generation: sorted.some((o) => o.image_generation),
      embedding_support: sorted.some((o) => o.embedding_support),
      context_window: contextWindow,
      capability_ids: capabilityIds,
      license_id: pickFirst(sorted, 'license_id'),
      status,
      aliases: rawAliases,
      offering_ids: sorted.map((o) => o.model_id).sort(),
    });

    for (const offering of offerings) {
      mapping.set(offering.model_id, slug);
    }
  }

  return { canonicals, mapping };
}

/**
 * Computes benchmark-derived quality for canonical models.
 *
 * Benchmark rows carry bare slugs (e.g. "claude-fable-5"), which match
 * canonical model ids exactly — no last-segment guessing needed anymore.
 */
export function computeQuality(canonicals: CanonicalModel[], benchmarks: Benchmark[]): void {
  const byCanonical = new Map<string, Benchmark[]>();
  for (const benchmark of benchmarks) {
    const key = canonicalSlug(benchmark.model_id);
    const list = byCanonical.get(key) ?? [];
    list.push(benchmark);
    byCanonical.set(key, list);
  }

  for (const canonical of canonicals) {
    const rows = byCanonical.get(canonical.model_id);
    if (!rows || rows.length === 0) continue;
    const score = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
    const quality: Quality = {
      score: Math.round(score * 100) / 100,
      benchmark_count: rows.length,
      categories: [...new Set(rows.flatMap((row) => row.category))].sort(),
      sources: [...new Set(rows.map((row) => row.source))].sort(),
    };
    canonical.quality = quality;
  }
}
