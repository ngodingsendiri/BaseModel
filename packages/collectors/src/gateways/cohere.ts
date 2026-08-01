import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const ModelSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()),
  context_length: z.number().nullable().optional(),
  tokenizer_url: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  models: z.array(ModelSchema),
  next_page_token: z.string().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveModality(endpoints: string[]): ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] {
  const modalities: ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] = ['text'];
  if (endpoints.includes('embed')) modalities.push('embedding');
  if (endpoints.includes('classify') || endpoints.includes('rerank')) {
    if (!modalities.includes('text')) modalities.push('text');
  }
  return modalities;
}

function deriveCapabilities(endpoints: string[]): string[] {
  const caps: string[] = [];
  if (endpoints.includes('embed')) caps.push('embedding');
  if (endpoints.includes('classify')) caps.push('classification');
  if (endpoints.includes('rerank')) caps.push('reranking');
  if (endpoints.includes('summarize')) caps.push('summarization');
  if (endpoints.includes('generate')) caps.push('generation');
  return caps;
}

const gatewayId = 'cohere';

export default {
  type: 'custom',
  id: gatewayId,
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: gatewayId, models: [], errors: [] };

    const apiKey = secrets['COHERE_API_KEY'];
    if (!apiKey) {
      result.errors.push('COHERE_API_KEY secret is missing');
      return result;
    }

    const baseUrl = 'https://api.cohere.com';
    const endpoint = '/v1/models';

    let url = `${baseUrl}${endpoint}`;
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = 5;

    while (hasNextPage && pageCount < maxPages) {
      pageCount++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          result.errors.push(`HTTP ${response.status}: ${response.statusText}`);
          return result;
        }

        const raw = await response.json() as unknown;
        const parsed = ResponseSchema.safeParse(raw);

        if (!parsed.success) {
          result.errors.push(`Validation error: ${parsed.error.message}`);
          return result;
        }

        const { models, next_page_token } = parsed.data;

        for (const model of models) {
          const modelId = `${gatewayId}/${slugify(model.name)}`;
          const modality = deriveModality(model.endpoints);
          const capabilityIds = deriveCapabilities(model.endpoints);
          const contextWindow = model.context_length ?? undefined;

          const modelEntry = {
            model_id: modelId,
            provider_id: gatewayId,
            name: model.name,
            family: model.name.split('-')[0] ?? undefined,
            context_window: contextWindow,
            modality,
            open_weight: false,
            reasoning_support: false,
            function_calling: model.endpoints.includes('chat'),
            structured_output: false,
            vision_support: false,
            audio_support: false,
            image_generation: false,
            embedding_support: model.endpoints.includes('embed'),
            capability_ids: capabilityIds.length > 0 ? capabilityIds : undefined,
            status: 'active' as const,
          };

          result.models.push(modelEntry);
        }

        if (!next_page_token) {
          hasNextPage = false;
        } else {
          url = `${baseUrl}${endpoint}?next_page_token=${encodeURIComponent(next_page_token)}`;
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          result.errors.push(`Fetch error: ${err.message}`);
        } else {
          result.errors.push('Unknown fetch error');
        }
        return result;
      }
    }

    return result;
  },
} satisfies CustomGateway;
