import type { SimpleGateway } from '../core/collector';

/**
 * DeepInfra — Serverless GPU inference for open-source models.
 * OpenAI-compatible API. Secret: DEEPINFRA_API_KEY
 * Docs: https://deepinfra.com/docs
 */
export default {
  type: 'openai-compatible',
  id: 'deepinfra',
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  secretKeyName: 'DEEPINFRA_API_KEY',
} satisfies SimpleGateway;
