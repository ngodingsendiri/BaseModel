import { z } from 'zod';

/**
 * Canonical Zod schema for the Model entity.
 *
 * The Model is the central entity of BaseModel. It belongs to one Provider
 * and is related to Capabilities, Benchmarks, Pricing, APIs, and a License.
 * @see docs/05_Data_Model.md — Entity: Model
 */
export const ModelSchema = z.object({
  // --- Identifiers ---
  model_id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9]+(?:[-.][a-z0-9]+)*$/, {
    message: 'model_id must follow "{provider_id}/{model-slug}" format (e.g. "openai/gpt-4o")',
  }),
  provider_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),

  // --- Core Attributes ---
  name: z.string().min(1),           // Human-readable name, e.g. "GPT-4o"
  family: z.string().optional(),     // Model family, e.g. "GPT-4"
  version: z.string().optional(),    // Specific version string, e.g. "2024-08-06"
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'release_date must be ISO 8601 date (YYYY-MM-DD)',
    })
    .optional(),
  description: z.string().optional(),

  // --- Technical Characteristics ---
  architecture: z.string().optional(),      // e.g. "transformer", "mixture-of-experts"
  parameter_size: z.string().optional(),    // e.g. "70B", "~200B"
  context_window: z.number().int().positive().optional(), // in tokens
  modality: z.array(
    z.enum(['text', 'image', 'audio', 'video', 'code', 'embedding']),
  ),

  // --- Capability Flags ---
  open_weight: z.boolean(),
  reasoning_support: z.boolean(),
  function_calling: z.boolean(),
  structured_output: z.boolean(),
  vision_support: z.boolean(),
  audio_support: z.boolean(),
  image_generation: z.boolean(),
  embedding_support: z.boolean(),

  // --- Relationships (arrays of IDs, resolved separately) ---
  capability_ids: z.array(z.string()).default([]),
  license_id: z.string().optional(),

  // --- Status ---
  status: z.enum(['active', 'preview', 'deprecated', 'discontinued']),
});

export type Model = z.infer<typeof ModelSchema>;
