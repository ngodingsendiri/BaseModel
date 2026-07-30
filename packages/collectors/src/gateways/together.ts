import type { SimpleGateway } from '../core/collector';

/**
 * Together AI — Large open-source model hosting & inference.
 * OpenAI-compatible API. Secret: TOGETHER_API_KEY
 * Docs: https://docs.together.ai
 */
export default {
  type: 'openai-compatible',
  id: 'together',
  baseUrl: 'https://api.together.ai/v1',
  secretKeyName: 'TOGETHER_API_KEY',
} satisfies SimpleGateway;
