/**
 * Secrets are capabilities granted by the trusted collector runtime, never by
 * a plugin declaration. Adding a secret here requires a reviewed core change.
 */
export const GATEWAY_SECRET_KEYS = {
  anthropic: ['ANTHROPIC_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  cloudflare: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
  cohere: ['COHERE_API_KEY'],
  deepinfra: ['DEEPINFRA_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  google: ['GOOGLE_AI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  hyperbolic: ['HYPERBOLIC_API_KEY'],
  litellm: ['LITELLM_BASE_URL', 'LITELLM_API_KEY'],
  'mistral-ai': ['MISTRAL_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  portkey: ['PORTKEY_API_KEY'],
  requesty: ['REQUESTY_API_KEY'],
  together: ['TOGETHER_API_KEY'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export function getGatewaySecretKeys(gatewayId: string): readonly string[] {
  return GATEWAY_SECRET_KEYS[gatewayId as keyof typeof GATEWAY_SECRET_KEYS] ?? [];
}
