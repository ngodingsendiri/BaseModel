import type { CollectionResult, CustomGateway } from '../core/collector';
export default {
  type: 'custom',
  id: 'helicone',
  async collect(_s): Promise<CollectionResult> {
    return {
      provider_id: 'helicone',
      models: [],
      errors: ['Helicone is a proxy with no model catalog. Set HELICONE_API_KEY to use as proxy.'],
    };
  },
} satisfies CustomGateway;
