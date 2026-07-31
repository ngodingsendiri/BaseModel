import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const Schema = z.object({
  data: z.array(z.object({ id: z.string(), max_tokens: z.number().optional() })),
});

export default {
  type: 'custom',
  id: 'litellm',
  async collect(secrets): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'litellm', models: [], errors: [] };
    const base = secrets.LITELLM_BASE_URL;
    const key = secrets.LITELLM_API_KEY;

    if (!base) {
      result.errors.push('LITELLM_BASE_URL is required');
      return result;
    }

    try {
      const url = `${base.replace(/\/$/, '')}/v1/models`;
      const headers: Record<string, string> = {};
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const parsed = Schema.safeParse(await response.json());
      if (!parsed.success) {
        result.errors.push(parsed.error.message);
        return result;
      }

      for (const model of parsed.data.data) {
        result.models.push({
          model_id: `litellm/${model.id}`,
          provider_id: 'litellm',
          name: model.id,
          context_window: model.max_tokens,
          status: 'active',
          modality: ['text'],
          open_weight: false,
          reasoning_support: false,
          function_calling: false,
          structured_output: false,
          vision_support: false,
          audio_support: false,
          image_generation: false,
          embedding_support: false,
        });
      }
    } catch (error: unknown) {
      result.errors.push(error instanceof Error ? error.message : 'err');
    }

    return result;
  },
} satisfies CustomGateway;
