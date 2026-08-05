import type { CanonicalModel, Offering } from '@basemodel/schema';
import type { IntelligenceEngine } from '../core/engine';
import { computeQuality, resolveCanonicalModels } from '../core/resolution';
import { calculateCostEfficiency } from './cost';

/**
 * Builds the complete v2 view (canonical models + offerings) from a loaded
 * intelligence engine. Used by the publisher (dist/v2), the CLI (`best`),
 * and the MCP server, so every surface answers from the same logic.
 */
export interface V2Snapshot {
  canonicals: CanonicalModel[];
  offerings: Offering[];
  /** offering id -> canonical model id */
  mapping: Map<string, string>;
}

export function buildV2Snapshot(engine: IntelligenceEngine): V2Snapshot {
  engine.ensureLoaded();

  const { canonicals, mapping } = resolveCanonicalModels(engine.models);
  // Attach benchmark-derived quality when the snapshot carries benchmarks.
  if (engine.benchmarks.length > 0) {
    computeQuality(canonicals, engine.benchmarks);
  }

  // Economics per offering, straight from the offering's own pricing rows.
  const offerings: Offering[] = engine.models.map((model) => {
    const cost = calculateCostEfficiency(engine, model.model_id);
    return {
      offering_id: model.model_id,
      model_id: mapping.get(model.model_id) ?? model.model_id,
      provider_id: model.provider_id,
      status: model.status,
      context_window: model.context_window,
      cost_tier: cost.tier,
      blended_cost_per_1m: cost.blendedCost,
    };
  });

  // Mark the cheapest active offering per canonical model. Free counts as 0.
  for (const canonical of canonicals) {
    const actives = offerings.filter(
      (o) =>
        o.model_id === canonical.model_id && o.status === 'active' && o.cost_tier !== 'Unknown',
    );
    if (actives.length === 0) continue;
    const cheapest = actives.reduce((best, o) =>
      (o.blended_cost_per_1m ?? 0) < (best.blended_cost_per_1m ?? 0) ? o : best,
    );
    cheapest.is_cheapest = true;
  }

  offerings.sort((a, b) => a.offering_id.localeCompare(b.offering_id));
  return { canonicals, offerings, mapping };
}

export interface BestModelsCriteria {
  /** Benchmark category filter, e.g. "coding", "general", "vision". */
  category?: string;
  /** Maximum blended cost per 1M tokens (0 allowed for free-only). */
  maxCost?: number;
  /** Minimum required context window. */
  minContextWindow?: number;
  limit?: number;
}

export interface BestModelResult {
  canonical: CanonicalModel;
  /** Cheapest active offering, when one exists. */
  offering?: Offering;
  /** True when no other model has >= quality at <= cost (Pareto frontier). */
  pareto_optimal: boolean;
}

/**
 * Answers "best model for use-case X under budget Y": active canonical
 * models with a quality score, optionally within a cost ceiling, ranked by
 * quality (cost as tiebreaker). Marks the Pareto frontier of the result set.
 */
export function bestModels(
  snapshot: V2Snapshot,
  criteria: BestModelsCriteria = {},
): BestModelResult[] {
  const limit = criteria.limit ?? 10;

  const scored = snapshot.canonicals.filter((canonical) => {
    if (canonical.status !== 'active') return false;
    if (!canonical.quality) return false;
    if (criteria.category && !canonical.quality.categories.includes(criteria.category)) {
      return false;
    }
    if (criteria.minContextWindow !== undefined) {
      if (!canonical.context_window || canonical.context_window < criteria.minContextWindow) {
        return false;
      }
    }
    return true;
  });

  // Cheapest active offering cost per canonical (undefined when unpriced).
  const cheapestCost = new Map<string, number>();
  for (const offering of snapshot.offerings) {
    if (offering.status !== 'active' || offering.cost_tier === 'Unknown') continue;
    const cost = offering.blended_cost_per_1m ?? 0;
    const current = cheapestCost.get(offering.model_id);
    if (current === undefined || cost < current) cheapestCost.set(offering.model_id, cost);
  }

  const withinBudget = scored.filter((canonical) => {
    if (criteria.maxCost === undefined) return true;
    const cost = cheapestCost.get(canonical.model_id);
    return cost !== undefined && cost <= criteria.maxCost;
  });

  // Pareto frontier over quality (maximize) vs cheapest cost (minimize).
  const frontier = new Set<string>();
  for (const candidate of withinBudget) {
    const candidateCost = cheapestCost.get(candidate.model_id);
    const candidateQuality = candidate.quality?.score ?? 0;
    const dominated = withinBudget.some((other) => {
      if (other.model_id === candidate.model_id) return false;
      const otherCost = cheapestCost.get(other.model_id);
      const otherQuality = other.quality?.score ?? 0;
      // Unpriced models cannot dominate priced ones and vice versa.
      if (candidateCost === undefined || otherCost === undefined) return false;
      return (
        otherQuality >= candidateQuality &&
        otherCost <= candidateCost &&
        (otherQuality > candidateQuality || otherCost < candidateCost)
      );
    });
    if (!dominated) frontier.add(candidate.model_id);
  }

  const ranked = [...withinBudget].sort((a, b) => {
    const qualityDifference = (b.quality?.score ?? 0) - (a.quality?.score ?? 0);
    if (qualityDifference) return qualityDifference;
    const costA = cheapestCost.get(a.model_id);
    const costB = cheapestCost.get(b.model_id);
    if (costA !== undefined && costB !== undefined && costA !== costB) return costA - costB;
    return a.model_id.localeCompare(b.model_id);
  });

  return ranked.slice(0, limit).map((canonical) => {
    const candidates = snapshot.offerings.filter(
      (o) => o.model_id === canonical.model_id && o.status === 'active',
    );
    const offering = candidates.find((o) => o.is_cheapest) ?? candidates[0];
    return {
      canonical,
      offering,
      pareto_optimal: frontier.has(canonical.model_id),
    };
  });
}
