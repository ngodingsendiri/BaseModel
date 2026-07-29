import type { Model } from '@basemodel/schema';
import type { IntelligenceEngine } from '../core/engine';

export interface SearchCriteria {
  /** Array of provider IDs. If provided, models must belong to one of these. */
  providerIds?: string[];

  /** Array of modalities. If provided, models must support ALL of these. */
  modalities?: string[];

  /** Array of feature flags that must be true. e.g., 'open_weight', 'reasoning_support' */
  flags?: Array<keyof Model>;

  /** Minimum context window required. */
  minContextWindow?: number;
}

export function searchModels(engine: IntelligenceEngine, criteria: SearchCriteria): Model[] {
  engine.ensureLoaded();

  return engine.models.filter((model) => {
    // Check provider
    if (criteria.providerIds && criteria.providerIds.length > 0) {
      if (!criteria.providerIds.includes(model.provider_id)) return false;
    }

    // Check modalities (Must contain all requested)
    if (criteria.modalities && criteria.modalities.length > 0) {
      const hasAllModalities = criteria.modalities.every((m) =>
        model.modality.includes(m as never),
      );
      if (!hasAllModalities) return false;
    }

    // Check boolean flags
    if (criteria.flags && criteria.flags.length > 0) {
      const hasAllFlags = criteria.flags.every((flag) => {
        return model[flag] === true;
      });
      if (!hasAllFlags) return false;
    }

    // Check context window
    if (criteria.minContextWindow !== undefined) {
      if (!model.context_window || model.context_window < criteria.minContextWindow) {
        return false;
      }
    }

    return true;
  });
}
