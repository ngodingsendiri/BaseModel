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
 * Deterministic preference order when several pricing records exist for the
 * same model and pricing type: the model's own provider catalog wins, then
 * the aggregate OpenRouter catalog, then other gateway catalogs, then
 * Hugging Face. Records without provenance rank last. This removes the
 * last-write-wins nondeterminism of iterating records in file order.
 */
function sourcePriority(modelId: string, source: string | undefined): number {
  if (!source) return 4;
  const providerId = modelId.split('/')[0];
  if (source === providerId) return 0;
  if (source === 'openrouter') return 1;
  if (source === 'huggingface') return 3;
  return 2;
}

/** Picks the per-1M record with the highest-priority provenance. */
function pickTokenRecord(
  engine: IntelligenceEngine,
  modelId: string,
  pricingType: 'input-token' | 'output-token',
) {
  let best: { value: number; priority: number } | undefined;
  for (const record of engine.pricing) {
    if (record.model_id !== modelId) continue;
    if (record.pricing_type !== pricingType) continue;
    if (!record.unit?.includes('1M')) continue;
    const priority = sourcePriority(modelId, record.source);
    if (!best || priority < best.priority) {
      best = { value: record.value || 0, priority };
    }
  }
  return best;
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

  const inputRecord = pickTokenRecord(engine, modelId, 'input-token');
  const outputRecord = pickTokenRecord(engine, modelId, 'output-token');
  if (inputRecord) inputCost = inputRecord.value;
  if (outputRecord) outputCost = outputRecord.value;

  const blended = blendedCost(inputCost, outputCost);

  let tier: CostTier = 'Unknown';
  if (blended === 0 && inputRecord && outputRecord) {
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
