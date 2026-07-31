export type ModelTier = 'free' | 'budget' | 'balanced' | 'premium';

export interface TierResult {
  tier: ModelTier;
  isFree: boolean;
}

/**
 * Classifies a model into an economics tier from its per-1M-token pricing.
 * Uses the same blended-cost heuristic as the intelligence engine:
 * assume 3 input tokens for every 1 output token.
 *
 * - free    : both input and output cost 0
 * - budget  : blended cost < $0.50 per 1M tokens
 * - balanced: blended cost <= $5 per 1M tokens
 * - premium : blended cost > $5 per 1M tokens
 */
export function classifyTier(inputCostPer1M: number, outputCostPer1M: number): TierResult {
  if (inputCostPer1M === 0 && outputCostPer1M === 0) {
    return { tier: 'free', isFree: true };
  }
  const blended = (inputCostPer1M * 3 + outputCostPer1M * 1) / 4;
  if (blended < 0.5) return { tier: 'budget', isFree: false };
  if (blended <= 5) return { tier: 'balanced', isFree: false };
  return { tier: 'premium', isFree: false };
}

export interface PricingBreakdown {
  inputCostPer1M: number;
  outputCostPer1M: number;
}
