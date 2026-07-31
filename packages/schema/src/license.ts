import { z } from 'zod';
import { HttpUrlSchema } from './url.js';

/**
 * Canonical Zod schema for the License entity.
 *
 * Represents the legal terms governing a model.
 * @see docs/05_Data_Model.md - Entity: License
 */
export const LicenseSchema = z.object({
  license_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9.]+)*$/, {
    message: 'license_id must be kebab-case (e.g. "mit", "apache-2.0", "proprietary")',
  }),
  name: z.string().min(1),
  commercial_use: z.boolean(),
  redistribution: z.boolean(),
  modification: z.boolean(),
  source_available: z.boolean(),
  url: HttpUrlSchema.optional(),
});

export type License = z.infer<typeof LicenseSchema>;
