import type { SimpleGateway } from '../core/collector';

/**
 * Hyperbolic — Affordable GPU inference for open-source AI.
 * OpenAI-compatible API. Secret: HYPERBOLIC_API_KEY
 * Docs: https://docs.hyperbolic.xyz
 */
export default {
  type: 'openai-compatible',
  id: 'hyperbolic',
  baseUrl: 'https://api.hyperbolic.xyz/v1',
  secretKeyName: 'HYPERBOLIC_API_KEY',
} satisfies SimpleGateway;
