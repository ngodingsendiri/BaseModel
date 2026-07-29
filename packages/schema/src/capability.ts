import { z } from 'zod';

/**
 * Canonical Zod schema for the Capability entity.
 *
 * Represents a named capability that can be shared by many models.
 * Capabilities form a managed, canonical vocabulary.
 * @see docs/05_Data_Model.md — Entity: Capability
 */
export const CapabilitySchema = z.object({
  capability_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'capability_id must be kebab-case (e.g. "text-generation", "tool-calling")',
  }),
  name: z.string().min(1),
  description: z.string().optional(),
});

export type Capability = z.infer<typeof CapabilitySchema>;
