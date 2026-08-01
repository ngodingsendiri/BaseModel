import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const cohereModelSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()).optional(),
  context_length: z.number().optional(),
});

const cohereResponseSchema = z.object({
  models: z.array(cohereModelSchema),
  next_page_token: z.string().optional(),
});

export default {
  type: 'custom',
  id: 'cohere',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'cohere', models: [], errors: [] };
    const apiKey = secrets.COHERE_API_KEY;

    if (!apiKey) {
      result.errors.push('Missing secret COHERE_API_KEY');
      return result;
    }

    let url: string | undefined = 'https://api.cohere.com/v1/models';
    let pagesFetched = 0;
    const maxPages = 10;

    try {
      while (url && pagesFetched < maxPages) {
        pagesFetched++;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          result.errors.push(`Failed to fetch models: ${response.status} ${response.statusText}`);
          break;
        }

        const json = await response.json();
        const parsed = cohereResponseSchema.safeParse(json);

        if (!parsed.success) {
          result.errors.push(`Failed to parse response: ${parsed.error.message}`);
          break;
        }

        for (const item of parsed.data.models) {
          const rawName = item.name;
          const slug = rawName
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          const model_id = `cohere/${slug}`;

          const endpoints = item.endpoints || [];
          const isEmbed = endpoints.includes('embed') || rawName.includes('embed');
          const isChat = endpoints.includes('chat') || endpoints.includes('generate');

          const modality: ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] = [];
          if (isChat) {
            modality.push('text');
          }
          if (isEmbed) {
            modality.push('embedding');
          }
          if (modality.length === 0) {
            modality.push('text');
          }

          result.models.push({
            model_id,
            provider_id: 'cohere',
            name: rawName,
            family: rawName.includes('command') ? 'Command' : undefined,
            context_window: item.context_length,
            modality,
            open_weight: false,
            reasoning_support: false,
            function_calling: false,
            structured_output: false,
            vision_support: false,
            audio_support: false,
            image_generation: false,
            embedding_support: isEmbed,
            status: 'active',
          });
        }

        url = undefined;
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        result.errors.push(err.message);
      } else {
        result.errors.push(String(err));
      }
    }

    return result;
  },
} satisfies CustomGateway;
