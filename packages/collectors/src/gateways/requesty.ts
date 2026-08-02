import type { SimpleGateway } from '../core/collector';

/**
 * Requesty — AI model router with cost optimization.
 * OpenAI-compatible API. Secret: REQUESTY_API_KEY
 * Docs: https://requesty.ai/docs
 *
 * Declares a public pricing catalog (`/v1/models`) that the enrich step reads
 * to price `requesty/*` models with Requesty's own resale rates.
 */
export default {
  type: 'openai-compatible',
  id: 'requesty',
  baseUrl: 'https://router.requesty.ai/v1',
  secretKeyName: 'REQUESTY_API_KEY',
  pricingSource: {
    url: 'https://router.requesty.ai/v1/models',
    auth: 'none',
  },
} satisfies SimpleGateway;
