import type { Model } from '@basemodel/schema';
import type { IntelligenceEngine } from '../core/engine';

export interface AlternativeResult {
  model: Model;
  reason: string;
}

/**
 * Finds comparable alternative models for a given model.
 *
 * Criteria for alternatives:
 * 1. Must support ALL modalities of the original model.
 * 2. Context window must be >= 50% of the original model's context window.
 * 3. Should ideally be from a different provider or a newer model.
 */
export function findAlternatives(
  engine: IntelligenceEngine,
  modelId: string,
  limit = 3,
): AlternativeResult[] {
  engine.ensureLoaded();

  const original = engine.models.find((m) => m.model_id === modelId);
  if (!original) {
    throw new Error(`Model not found: ${modelId}`);
  }

  const results: AlternativeResult[] = [];

  for (const candidate of engine.models) {
    if (candidate.model_id === original.model_id) continue;
    if (candidate.status !== 'active') continue;

    // Must have at least all modalities of the original
    const hasAllModalities = original.modality.every((m) => candidate.modality.includes(m));
    if (!hasAllModalities) continue;

    // Context window check (allow slight downgrades, e.g., 100k instead of 128k)
    const origCw = original.context_window || 0;
    const candCw = candidate.context_window || 0;
    if (origCw > 0 && (candCw === 0 || candCw < origCw * 0.5)) continue;

    // Must have function calling if original has it
    if (original.function_calling && !candidate.function_calling) continue;

    // Reason builder
    const reasonParts = [];
    if (candidate.provider_id !== original.provider_id) {
      reasonParts.push(`Cross-provider alternative from ${candidate.provider_id}`);
    } else {
      reasonParts.push(`Alternative from the same provider`);
    }

    if (candCw > origCw) {
      reasonParts.push(`larger context window (${candCw})`);
    }

    results.push({
      model: candidate,
      reason: reasonParts.join(' with '),
    });
  }

  // Sort by context window descending as a basic ranking heuristic
  results.sort((a, b) => {
    const contextDifference = (b.model.context_window || 0) - (a.model.context_window || 0);
    return contextDifference || a.model.model_id.localeCompare(b.model.model_id);
  });

  return results.slice(0, limit);
}
