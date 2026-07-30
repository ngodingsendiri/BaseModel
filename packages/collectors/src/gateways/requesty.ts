import type { SimpleGateway } from '../core/collector';

/**
 * Requesty — AI model router with cost optimization.
 * OpenAI-compatible API. Secret: REQUESTY_API_KEY
 * Docs: https://requesty.ai/docs
 */
export default {
  type: 'openai-compatible',
  id: 'requesty',
  baseUrl: 'https://router.requesty.ai/v1',
  secretKeyName: 'REQUESTY_API_KEY',
} satisfies SimpleGateway;
