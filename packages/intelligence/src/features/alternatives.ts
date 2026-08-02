import type { Model } from '@basemodel/schema';
import type { IntelligenceEngine } from '../core/engine';

export interface AlternativeResult {
  model: Model;
  reason: string;
}

/** OpenRouter router endpoints that route to a dynamically selected model. */
const ROUTER_ENDPOINTS = new Set(['auto', 'auto-beta', 'bodybuilder', 'fusion', 'pareto-code']);

/** Providers that only re-serve upstream models (aggregators/routers). */
const ROUTER_PROVIDERS = new Set(['openrouter', 'requesty', 'vercel', 'portkey']);

/** Strips the provider prefix and canonicalizes dot/dash, leaving the underlying model slug. */
function physicalSlug(modelId: string): string {
  const slash = modelId.indexOf('/');
  const slug = slash === -1 ? modelId : modelId.slice(slash + 1);
  // Treat "mistral-medium-3.5" and "mistral-medium-3-5" as the same model.
  return slug.replace(/\./g, '-');
}

function isRouterEndpoint(model: Model): boolean {
  return (
    model.provider_id === 'openrouter' && ROUTER_ENDPOINTS.has(model.model_id.split('/')[1] ?? '')
  );
}

/** First-party providers are preferred over router re-serves for the same model. */
function isPreferredRepresentative(model: Model): boolean {
  return !ROUTER_PROVIDERS.has(model.provider_id);
}

/**
 * Finds comparable alternative models for a given model.
 *
 * Criteria for alternatives:
 * 1. Must support ALL modalities of the original model.
 * 2. Context window must be >= 50% of the original model's context window.
 * 3. Must have function calling if the original has it.
 * 4. OpenRouter router endpoints (auto, fusion, ...) are never recommended.
 * 5. The same physical model re-served by multiple router providers is
 *    collapsed into a single alternative (preferring the first-party one).
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
    if (isRouterEndpoint(candidate)) continue;

    // The same physical model is not an alternative to itself, even when
    // served by a different provider (e.g. openai/gpt-4o vs vercel/gpt-4o).
    if (physicalSlug(candidate.model_id) === physicalSlug(original.model_id)) continue;

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

  // Collapse duplicate physical models, keeping the preferred representative.
  const bestPerModel = new Map<string, AlternativeResult>();
  for (const alt of results) {
    const key = physicalSlug(alt.model.model_id);
    const existing = bestPerModel.get(key);
    if (!existing || isPreferredRepresentative(alt.model)) {
      bestPerModel.set(key, alt);
    }
  }

  const deduped = [...bestPerModel.values()];

  // Sort by context window descending as a basic ranking heuristic
  deduped.sort((a, b) => {
    const contextDifference = (b.model.context_window || 0) - (a.model.context_window || 0);
    return contextDifference || a.model.model_id.localeCompare(b.model.model_id);
  });

  return deduped.slice(0, limit);
}
