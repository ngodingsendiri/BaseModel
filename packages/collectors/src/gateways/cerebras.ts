import type { SimpleGateway } from '../core/collector';

/**
 * Cerebras — Wafer-scale AI chips for ultra-fast inference.
 * OpenAI-compatible API. Secret: CEREBRAS_API_KEY
 * Docs: https://inference-docs.cerebras.ai
 */
export default {
  type: 'openai-compatible',
  id: 'cerebras',
  baseUrl: 'https://api.cerebras.ai/v1',
  secretKeyName: 'CEREBRAS_API_KEY',
} satisfies SimpleGateway;
