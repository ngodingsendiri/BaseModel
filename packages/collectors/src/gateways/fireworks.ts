import type { SimpleGateway } from '../core/collector';

/**
 * Fireworks AI — Fast inference platform for open-source models.
 * OpenAI-compatible API. Secret: FIREWORKS_API_KEY
 * Docs: https://docs.fireworks.ai
 */
export default {
  type: 'openai-compatible',
  id: 'fireworks',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  secretKeyName: 'FIREWORKS_API_KEY',
} satisfies SimpleGateway;
