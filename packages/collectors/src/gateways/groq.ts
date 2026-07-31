import type { SimpleGateway } from '../core/collector';

/**
 * Groq — Ultra-fast inference gateway.
 * OpenAI-compatible API. Secret: GROQ_API_KEY
 * Docs: https://console.groq.com/docs
 */
export default {
  type: 'openai-compatible',
  id: 'groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  secretKeyName: 'GROQ_API_KEY',
} satisfies SimpleGateway;
