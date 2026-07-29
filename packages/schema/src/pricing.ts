import { z } from 'zod';

/**
 * Canonical Zod schema for the Pricing entity.
 *
 * Represents how a model is priced. A model can have multiple pricing records
 * (e.g., one for input tokens, one for output tokens).
 * @see docs/05_Data_Model.md — Entity: Pricing
 */
export const PricingSchema = z.object({
  pricing_id: z.string().min(1),
  model_id: z.string().min(1),
  pricing_type: z.enum([
    'free',
    'input-token',
    'output-token',
    'cached-token',
    'request',
    'subscription',
  ]),
  currency: z.string().length(3).optional(), // ISO 4217, e.g. "USD". Optional for free tiers.
  unit: z.string().optional(), // e.g. "1M tokens", "request"
  value: z.number().nonnegative().optional(), // Cost per unit. 0 for free.
  notes: z.string().optional(),
});

export type Pricing = z.infer<typeof PricingSchema>;
