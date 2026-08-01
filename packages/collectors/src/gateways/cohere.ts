import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const cohereRawSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      endpoints: z.array(z.string()).optional(),
      context_length: z.number().optional(),
      tokenizer_url: z.string().optional(),
    }),
  ),
  next_page_token: z.string().optional(),
});

export default {
  type: 'custom',
  id: 'cohere',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'cohere', models: [], errors: [] };
    const apiKey = secrets.COHERE_API_KEY;

    let url: string | undefined = 'https://api.cohere.com/v1/models';
    let pagesFetched = 0;
    const maxPages = 10;

    try {
      while (url && pagesFetched < maxPages) {
        pagesFetched++;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          result.errors.push(`Failed to fetch models: ${response.status} ${response.statusText}`);
          return result;
        }

        const json = await response.json();
        const parsed = cohereRawSchema.safeParse(json);

        if (!parsed.success) {
          result.errors.push(`Failed to parse response: ${parsed.error.message}`);
          return result;
        }

        for (const rawModel of parsed.data.models) {
          const rawName = rawModel.name;
          const slug = rawName
            .toLowerCase()
            .replace(/[^a-z0-9.-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          const model_id = `cohere/${slug}`;

          const endpoints = rawModel.endpoints ?? [];
          const isEmbed = endpoints.includes('embed') || rawName.includes('embed');

          const modality: Array<'text' | 'image' | 'audio' | 'video' | 'code' | 'embedding'> =
            isEmbed ? ['embedding'] : ['text'];
          const embedding_support = isEmbed;
          const function_calling = endpoints.includes('chat') && !isEmbed;
          const structured_output = endpoints.includes('chat') && !isEmbed;

          result.models.push({
            model_id,
            provider_id: 'cohere',
            name: rawName,
            family: rawName.toLowerCase().includes('command') ? 'Command' : undefined,
            context_window: rawModel.context_length,
            modality,
            open_weight: false,
            reasoning_support: false,
            function_calling,
            structured_output,
            vision_support: false,
            audio_support: false,
            image_generation: false,
            embedding_support,
            status: 'active',
          });
        }

        url = parsed.data.next_page_token;
      }
    } catch (error) {
      result.errors.push(
        `Network or parsing error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return result;
  },
} satisfies CustomGateway;
