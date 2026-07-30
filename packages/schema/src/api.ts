import { z } from 'zod';
import { HttpUrlSchema } from './url.js';

/**
 * Canonical Zod schema for the API entity.
 *
 * Represents one method of accessing a model.
 * Describes HOW a model is consumed, not who owns it.
 * @see docs/05_Data_Model.md - Entity: API
 */
export const ApiSchema = z.object({
  api_id: z.string().min(1),
  model_id: z.string().min(1),
  protocol: z.enum(['openai-compatible', 'native-rest', 'grpc', 'ollama', 'other']),
  endpoint: HttpUrlSchema.optional(),
  compatibility: z.array(z.string()).optional(), // e.g. ["openai", "anthropic"]
  authentication: z.enum(['api-key', 'oauth2', 'none', 'other']),
  rate_limits: z
    .object({
      requests_per_minute: z.number().int().positive().optional(),
      tokens_per_minute: z.number().int().positive().optional(),
      tokens_per_day: z.number().int().positive().optional(),
    })
    .optional(),
});

export type Api = z.infer<typeof ApiSchema>;
