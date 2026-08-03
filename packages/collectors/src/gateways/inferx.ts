import type { SimpleGateway } from '../core/collector';

/**
 * InferX — Serverless inference endpoints for OpenAI-compatible workloads.
 * OpenAI-compatible API. Secret: INFERX_API_KEY
 * Docs: https://inferx.net/
 *
 * Declares a public pricing catalog (`/v1/models`) that the enrich step reads
 * to price `inferx/*` models with InferX's own resale rates.
 */
export default {
  type: 'openai-compatible',
  id: 'inferx',
  baseUrl: 'https://model.inferx.net/v1',
  secretKeyName: 'INFERX_API_KEY',
  pricingSource: {
    url: 'https://model.inferx.net/v1/models',
    auth: 'secret',
    itemsPath: 'data',
    idField: 'id',
    contextField: 'max_tokens',
    pricingUnit: 'per-1m',
    inputPriceField: 'input_price',
    outputPriceField: 'output_price',
  },
} satisfies SimpleGateway;
