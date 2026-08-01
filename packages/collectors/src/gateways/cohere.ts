import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const rawModelSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()).nullable().optional(),
  finetuned: z.boolean().optional(),
  context_length: z.number().nullable().optional(),
  tokenizer_url: z.string().nullable().optional(),
  default_endpoints: z.array(z.string()).nullable().optional(),
  features: z.array(z.string()).nullable().optional(),
});

const rawResponseSchema = z.object({
  models: z.array(rawModelSchema),
  next_page_token: z.string().nullable().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveModality(
  endpoints: string[] | null | undefined,
  features: string[] | null | undefined,
): ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] {
  const modalities: ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] = ['text'];

  if (endpoints?.includes('embed')) {
    if (!modalities.includes('embedding')) modalities.push('embedding');
  }
  if (endpoints?.includes('classify') || features?.includes('classification')) {
    if (!modalities.includes('embedding')) modalities.push('embedding');
  }
  if (
    endpoints?.includes('generate') ||
    features?.includes('image_generation') ||
    features?.includes('image')
  ) {
    if (!modalities.includes('image')) modalities.push('image');
  }
  if (features?.includes('audio')) {
    if (!modalities.includes('audio')) modalities.push('audio');
  }
  if (features?.includes('code')) {
    if (!modalities.includes('code')) modalities.push('code');
  }
  return modalities;
}

function deriveCapabilities(
  endpoints: string[] | null | undefined,
  features: string[] | null | undefined,
): string[] {
  const caps: string[] = [];
  if (endpoints?.includes('chat')) caps.push('chat');
  if (endpoints?.includes('embed') || features?.includes('classification')) caps.push('embedding');
  if (endpoints?.includes('classify')) caps.push('classification');
  if (endpoints?.includes('rerank')) caps.push('reranking');
  if (features?.includes('supports_rag')) caps.push('rag');
  if (features?.includes('search')) caps.push('search');
  if (endpoints?.includes('summarize')) caps.push('summarization');
  if (features?.includes('experimental_chat')) caps.push('experimental_chat');
  return caps;
}

export default {
  type: 'custom',
  id: 'cohere',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const apiKey = secrets['COHERE_API_KEY'];
    if (!apiKey) {
      return { provider_id: 'cohere', models: [], errors: ['COHERE_API_KEY secret is missing'] };
    }

    const baseUrl = 'https://api.cohere.com';
    const endpoint = '/v1/models';
    const url = `${baseUrl}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown fetch error';
      return { provider_id: 'cohere', models: [], errors: [`Failed to fetch: ${message}`] };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { provider_id: 'cohere', models: [], errors: ['Invalid JSON response'] };
    }

    const parsed = rawResponseSchema.safeParse(data);
    if (!parsed.success) {
      return {
        provider_id: 'cohere',
        models: [],
        errors: [`Validation error: ${parsed.error.message}`],
      };
    }

    const models: CollectionResult['models'] = [];
    for (const raw of parsed.data.models) {
      const name = raw.name;
      const slug = slugify(name);
      const modelId = `cohere/${slug}`;
      const endpoints = raw.endpoints ?? undefined;
      const features = raw.features ?? undefined;
      const modality = deriveModality(endpoints, features);
      const capabilities = deriveCapabilities(endpoints, features);
      const contextLength = raw.context_length;
      const contextWindow =
        typeof contextLength === 'number' && contextLength > 0 ? contextLength : undefined;

      models.push({
        model_id: modelId,
        provider_id: 'cohere',
        name: name,
        family: name.includes('command')
          ? 'command'
          : name.includes('embed')
            ? 'embed'
            : name.includes('rerank')
              ? 'rerank'
              : undefined,
        version: name.includes('v') ? name.split('v')[1]?.split('.')[0] : undefined,
        release_date: undefined,
        description: undefined,
        architecture: undefined,
        parameter_size: undefined,
        context_window: contextWindow,
        modality: modality,
        open_weight: false,
        reasoning_support: false,
        function_calling: endpoints?.includes('chat') ?? false,
        structured_output: endpoints?.includes('chat') ?? false,
        vision_support: endpoints?.includes('chat') ?? false,
        audio_support: endpoints?.includes('chat') ?? false,
        image_generation: false,
        embedding_support: endpoints?.includes('embed') ?? false,
        is_free: undefined,
        tier: undefined,
        limits: undefined,
        capability_ids: capabilities.length > 0 ? capabilities : undefined,
        license_id: undefined,
        status: raw.finetuned ? 'preview' : 'active',
      });
    }

    return { provider_id: 'cohere', models, errors: [] };
  },
} satisfies CustomGateway;
