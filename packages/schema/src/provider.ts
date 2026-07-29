import { z } from 'zod';

/**
 * Canonical Zod schema for the Provider entity.
 *
 * Represents an organization that develops, publishes, hosts, or distributes AI models.
 * @see docs/05_Data_Model.md — Entity: Provider
 */
export const ProviderSchema = z.object({
  provider_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'provider_id must be kebab-case (e.g. "openai", "mistral-ai")',
  }),
  name: z.string().min(1),
  organization: z.string().min(1),
  website: z.string().url(),
  documentation: z.string().url().optional(),
  country: z.string().min(2).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'deprecated']),
});

export type Provider = z.infer<typeof ProviderSchema>;
