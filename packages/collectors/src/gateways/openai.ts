import type { SimpleGateway } from '../core/collector';

/**
 * OpenAI — Direct API (OpenAI-compatible, no surprise here!)
 * Secret: OPENAI_API_KEY
 */
export default {
  type: 'openai-compatible',
  id: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  secretKeyName: 'OPENAI_API_KEY',
} satisfies SimpleGateway;
