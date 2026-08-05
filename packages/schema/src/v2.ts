import { z } from 'zod';
import { ModelLimitsSchema } from './limits.js';

/**
 * BaseModel v2 data model: canonical Model vs per-provider Offering.
 *
 * The v1 registry stores one record per provider offering and infers the
 * underlying physical model with slug heuristics. v2 makes that relation
 * explicit: a canonical Model describes the physical model once, and every
 * provider serve of it is an Offering with its own pricing, limits, and
 * lifecycle.
 *
 * @see docs/09_Model_Offering_v2.md
 */

export const MODALITIES = ['text', 'image', 'audio', 'video', 'code', 'embedding'] as const;

/** Derived benchmark quality attached to a canonical model. */
export const QualitySchema = z.object({
  /** Average of normalized benchmark scores (0–100). */
  score: z.number().min(0).max(100),
  /** Number of benchmark rows contributing to the score. */
  benchmark_count: z.number().int().nonnegative(),
  /** Union of benchmark categories (e.g. "coding", "general"). */
  categories: z.array(z.string()).default([]),
  /** Which sources contributed (lmarena/openllm/mirror). */
  sources: z.array(z.string()).default([]),
});
export type Quality = z.infer<typeof QualitySchema>;

/**
 * Canonical physical model. `model_id` is a provider-less slug
 * (e.g. "gpt-4o"), unique across the whole registry.
 */
export const CanonicalModelSchema = z.object({
  model_id: z.string().regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, {
    message: 'canonical model_id must be a provider-less slug (e.g. "gpt-4o")',
  }),
  name: z.string().min(1),
  family: z.string().optional(),
  description: z.string().optional(),
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),

  modality: z.array(z.enum(MODALITIES)),
  open_weight: z.boolean(),
  reasoning_support: z.boolean(),
  function_calling: z.boolean(),
  structured_output: z.boolean(),
  vision_support: z.boolean(),
  audio_support: z.boolean(),
  image_generation: z.boolean(),
  embedding_support: z.boolean(),

  /** Best known context window across all offerings. */
  context_window: z.number().int().positive().optional(),
  capability_ids: z.array(z.string()).default([]),
  license_id: z.string().optional(),

  /** active when at least one offering is active. */
  status: z.enum(['active', 'preview', 'deprecated', 'discontinued']),

  /** Every offering slug that resolves to this canonical model. */
  aliases: z.array(z.string()).default([]),
  /** Offering ids ({provider}/{slug}) serving this model. */
  offering_ids: z.array(z.string()).default([]),

  quality: QualitySchema.optional(),
});
export type CanonicalModel = z.infer<typeof CanonicalModelSchema>;

/**
 * A provider's serve of a canonical model, carrying the economics and
 * lifecycle that differ per provider.
 */
export const OfferingSchema = z.object({
  offering_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:[-.][a-z0-9]+)*$/, {
    message: 'offering_id must follow "{provider_id}/{model-slug}" format',
  }),
  model_id: z.string().min(1), // canonical model id
  provider_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),

  status: z.enum(['active', 'preview', 'deprecated', 'discontinued']),
  context_window: z.number().int().positive().optional(),
  limits: ModelLimitsSchema.optional(),

  /** Economics derived from this offering's pricing records. */
  cost_tier: z.enum(['Free', 'Budget-Friendly', 'Balanced', 'Premium', 'Unknown']).optional(),
  blended_cost_per_1m: z.number().nonnegative().optional(),
  /** True when this is the cheapest active offering of its canonical model. */
  is_cheapest: z.boolean().optional(),

  updated_at: z.string().datetime().optional(),
});
export type Offering = z.infer<typeof OfferingSchema>;
