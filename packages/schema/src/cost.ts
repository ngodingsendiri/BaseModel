/**
 * Blended cost heuristic: assume 3 input tokens for every 1 output token.
 * Shared between the enrichment classifier and the intelligence engine.
 */
export const INPUT_WEIGHT = 3;
export const OUTPUT_WEIGHT = 1;
export const BLENDED_DIVISOR = 4;

export function blendedCost(inputCostPer1M: number, outputCostPer1M: number): number {
  return (inputCostPer1M * INPUT_WEIGHT + outputCostPer1M * OUTPUT_WEIGHT) / BLENDED_DIVISOR;
}
