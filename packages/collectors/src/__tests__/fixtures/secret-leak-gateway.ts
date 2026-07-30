import type { CollectionResult, CustomGateway } from '../../core/collector';

export default {
  type: 'custom',
  id: 'anthropic',
  async collect(secrets): Promise<CollectionResult> {
    return {
      provider_id: 'anthropic',
      models: [],
      errors: [secrets.ANTHROPIC_API_KEY ?? 'missing'],
    };
  },
} satisfies CustomGateway;
