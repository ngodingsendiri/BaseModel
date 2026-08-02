import { blendedCost } from '@basemodel/schema';
import type { IntelligenceEngine } from '../core/engine';

export type CostTier = 'Free' | 'Budget-Friendly' | 'Balanced' | 'Premium' | 'Unknown';

export interface CostEfficiencyReport {
  modelId: string;
  isFree: boolean;
  inputCostPer1M: number;
  outputCostPer1M: number;
  blendedCost: number;
  tier: CostTier;
}

/**
 * Calculates the cost efficiency and pricing tier for a model.
 */
export function calculateCostEfficiency(
  engine: IntelligenceEngine,
  modelId: string,
): CostEfficiencyReport {
  engine.ensureLoaded();

  const pricingRecords = engine.pricing.filter((p) => p.model_id === modelId);

  if (pricingRecords.length === 0) {
    return {
      modelId,
      isFree: false,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      blendedCost: 0,
      tier: 'Unknown',
    };
  }

  // Check if fully free
  const isFree = pricingRecords.some((p) => p.pricing_type === 'free');
  if (isFree) {
    return {
      modelId,
      isFree: true,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      blendedCost: 0,
      tier: 'Free',
    };
  }

  let inputCost = 0;
  let outputCost = 0;

  const hasInputRecord = pricingRecords.some(
    (p) => p.pricing_type === 'input-token' && p.unit?.includes('1M'),
  );
  const hasOutputRecord = pricingRecords.some(
    (p) => p.pricing_type === 'output-token' && p.unit?.includes('1M'),
  );

  for (const record of pricingRecords) {
    if (record.pricing_type === 'input-token' && record.unit?.includes('1M')) {
      inputCost = record.value || 0;
    }
    if (record.pricing_type === 'output-token' && record.unit?.includes('1M')) {
      outputCost = record.value || 0;
    }
  }

  const blended = blendedCost(inputCost, outputCost);

  let tier: CostTier = 'Unknown';
  if (blended === 0 && hasInputRecord && hasOutputRecord) {
    // Both input and output are explicitly priced at 0 (without a `free` tag,
    // e.g. custom-gateway records). Mirror classifyTier: free.
    tier = 'Free';
  } else if (blended > 0) {
    if (blended < 0.5) tier = 'Budget-Friendly';
    else if (blended <= 5) tier = 'Balanced';
    else tier = 'Premium';
  }

  return {
    modelId,
    isFree: tier === 'Free',
    inputCostPer1M: inputCost,
    outputCostPer1M: outputCost,
    blendedCost: blended,
    tier,
  };
}
