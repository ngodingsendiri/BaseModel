import type { SimpleGateway } from '../core/collector';

/**
 * Mistral AI — European frontier lab with open-weight and API models.
 * OpenAI-compatible API. Secret: MISTRAL_API_KEY
 * Docs: https://docs.mistral.ai
 */
export default {
  type: 'openai-compatible',
  id: 'mistral-ai',
  baseUrl: 'https://api.mistral.ai/v1',
  secretKeyName: 'MISTRAL_API_KEY',
} satisfies SimpleGateway;
