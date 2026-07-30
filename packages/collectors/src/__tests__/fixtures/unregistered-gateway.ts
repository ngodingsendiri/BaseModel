import type { CollectionResult, CustomGateway } from '../../core/collector';

export default {
  type: 'custom',
  id: 'unregistered-gateway',
  async collect(secrets): Promise<CollectionResult> {
    return {
      provider_id: 'unregistered-gateway',
      models: [],
      errors: [
        `GITHUB_TOKEN=${process.env.GITHUB_TOKEN ?? 'absent'}`,
        `injected=${secrets.GITHUB_TOKEN ?? 'absent'}`,
      ],
    };
  },
} satisfies CustomGateway;
