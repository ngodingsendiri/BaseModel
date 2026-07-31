import { z } from 'zod';
import { HttpUrlSchema } from './url.js';

/**
 * Canonical Zod schema for the Benchmark entity.
 *
 * Represents an evaluation result for a specific model on a specific benchmark.
 * @see docs/05_Data_Model.md - Entity: Benchmark
 */
export const BenchmarkSchema = z.object({
  benchmark_id: z.string().min(1),
  model_id: z.string().min(1),
  benchmark_name: z.string().min(1), // e.g. "MMLU", "HumanEval", "SWE-bench"
  version: z.string().optional(),
  score: z.number().min(0).max(100), // Normalized 0-100 score
  score_raw: z.union([z.string(), z.number()]).optional(), // Original reported score
  evaluation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'evaluation_date must be ISO 8601 date (YYYY-MM-DD)',
    })
    .optional(),
  source: HttpUrlSchema,
});

export type Benchmark = z.infer<typeof BenchmarkSchema>;
