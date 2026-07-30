import type { CollectionResult, CustomGateway } from '../core/collector';
export default {
  type: 'custom',
  id: 'cloudflare',
  async collect(_s): Promise<CollectionResult> {
    return {
      provider_id: 'cloudflare',
      models: [],
      errors: [
        'Cloudflare AI Gateway is a proxy. For Workers AI use CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.',
      ],
    };
  },
} satisfies CustomGateway;
