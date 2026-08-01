import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const cohereModelSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()).optional(),
  context_length: z.number().optional(),
  tokenizer_url: z.string().optional(),
});

const cohereResponseSchema = z.object({
  models: z.array(cohereModelSchema),
});

export default {
  type: 'custom',
  id: 'cohere',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'cohere', models: [], errors: [] };
    const apiKey = secrets['COHERE_API_KEY'];

    if (!apiKey) {
      result.errors.push('Missing secret COHERE_API_KEY');
      return result;
    }

    try {
      const response = await fetch('https://api.cohere.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        result.errors.push(`Failed to fetch models: ${response.status} ${response.statusText}`);
        return result;
      }

      const rawJson: unknown = await response.json();
      const parseResult = cohereResponseSchema.safeParse(rawJson);

      if (!parseResult.success) {
        result.errors.push(`Validation error: ${parseResult.error.message}`);
        return result;
      }

      for (const item of parseResult.data.models) {
        const rawName = item.name;
        const slug = rawName.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const modelId = `cohere/${slug}`;

        if (!/^[a-z0-9-]+\/[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(modelId)) {
          continue;
        }

        const endpoints = item.endpoints ?? [];
        const isEmbed = endpoints.includes('embed') || rawName.includes('embed');
        const modality: Array<'text' | 'image' | 'audio' | 'video' | 'code' | 'embedding'> = isEmbed ? ['embedding'] : ['text'];

        result.models.push({
          model_id: modelId,
          provider_id: 'cohere',
          name: rawName,
          family: rawName.includes('command') ? 'Command' : undefined,
          context_window: item.context_length,
          modality,
          open_weight: false,
          reasoning_support: false,
          function_calling: endpoints.includes('chat'),
          structured_output: false,
          vision_support: false,
          audio_support: false,
          image_generation: false,
          embedding_support: isEmbed,
          status: 'active',
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        result.errors.push(error.message);
      } else {
        result.errors.push('An unknown error occurred during collection');
      }
    }

    return result;
  },
} satisfies CustomGateway;
