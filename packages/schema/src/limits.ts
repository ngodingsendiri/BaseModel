import { z } from 'zod';

/**
 * Canonical Zod schema for per-model operational limits.
 *
 * Captures rate and throughput constraints reported by the provider. All
 * fields are optional because providers rarely document every limit and the
 * registry is enriched incrementally.
 * @see docs/05_Data_Model.md - Entity: Model (limits)
 */
export const ModelLimitsSchema = z.object({
  rpm: z.number().int().positive().optional(), // Requests per minute
  tpm: z.number().int().positive().optional(), // Tokens per minute (input+output)
  rpd: z.number().int().positive().optional(), // Requests per day
  max_input_tokens: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  concurrent_requests: z.number().int().positive().optional(),
});

export type ModelLimits = z.infer<typeof ModelLimitsSchema>;
