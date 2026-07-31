import type { SimpleGateway } from '../core/collector';

/**
 * OpenRouter — Aggregator gateway with 200+ models.
 * OpenAI-compatible API. Secret: OPENROUTER_API_KEY
 * Docs: https://openrouter.ai/docs
 */
export default {
  type: 'openai-compatible',
  id: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  secretKeyName: 'OPENROUTER_API_KEY',
} satisfies SimpleGateway;
