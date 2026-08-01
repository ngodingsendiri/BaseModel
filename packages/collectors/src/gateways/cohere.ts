import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const ModelSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()).optional(),
  finetuned: z.boolean().optional(),
  context_length: z.number().nullable().optional(),
  tokenizer_url: z.string().nullable().optional(),
  default_endpoints: z.array(z.string()).optional(),
  features: z.array(z.string()).nullable().optional(),
});

type RawModel = z.infer<typeof ModelSchema>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveModality(
  endpoints: string[] | undefined,
  features: string[] | null | undefined,
): ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] {
  const modalities: ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] = ['text'];
  if (!endpoints) return modalities;
  if (endpoints.includes('embed')) modalities.push('embedding');
  if (endpoints.includes('generate') && features?.includes('image_generation'))
    modalities.push('image');
  if (endpoints.includes('audio')) modalities.push('audio');
  if (features?.includes('vision')) modalities.push('image');
  if (features?.includes('code')) modalities.push('code');
  return modalities;
}

function deriveCapabilities(
  endpoints: string[] | undefined,
  features: string[] | null | undefined,
): {
  reasoning_support: boolean;
  function_calling: boolean;
  structured_output: boolean;
  vision_support: boolean;
  audio_support: boolean;
  image_generation: boolean;
  embedding_support: boolean;
} {
  const hasEndpoint = (ep: string) => endpoints?.includes(ep) ?? false;
  const hasFeature = (f: string) => features?.includes(f) ?? false;
  return {
    reasoning_support: hasEndpoint('chat') && hasFeature('experimental_chat'),
    function_calling: hasEndpoint('chat'),
    structured_output: hasEndpoint('chat'),
    vision_support: hasFeature('vision'),
    audio_support: hasEndpoint('audio'),
    image_generation: hasFeature('image_generation'),
    embedding_support: hasEndpoint('embed'),
  };
}

export default {
  type: 'custom',
  id: 'cohere',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'cohere', models: [], errors: [] };
    const apiKey = secrets['COHERE_API_KEY'];
    if (!apiKey) {
      result.errors.push('COHERE_API_KEY secret is required');
      return result;
    }

    const baseUrl = 'https://api.cohere.com';
    const endpoint = '/v1/models';
    const url = `${baseUrl}${endpoint}`;

    const allModels: RawModel[] = [];
    let nextPageToken: string | undefined;

    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({});
      if (nextPageToken) params.set('next_page_token', nextPageToken);
      const fetchUrl = `${url}?${params.toString()}`;

      let response: Response;
      try {
        response = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to fetch models: ${message}`);
        break;
      }

      if (!response.ok) {
        result.errors.push(`API returned ${response.status}: ${response.statusText}`);
        break;
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to parse JSON: ${message}`);
        break;
      }

      const parsed = z
        .object({
          models: z.array(ModelSchema),
          next_page_token: z.string().optional(),
        })
        .safeParse(data);

      if (!parsed.success) {
        result.errors.push(
          `Invalid response shape: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        );
        break;
      }

      allModels.push(...parsed.data.models);
      nextPageToken = parsed.data.next_page_token;

      if (!nextPageToken) break;
    }

    for (const raw of allModels) {
      const modelId = `cohere/${slugify(raw.name)}`;
      const modality = deriveModality(raw.endpoints, raw.features);
      const caps = deriveCapabilities(raw.endpoints, raw.features);

      const model: {
        model_id: string;
        provider_id: string;
        name: string;
        family?: string;
        version?: string;
        release_date?: string;
        description?: string;
        architecture?: string;
        parameter_size?: string;
        context_window?: number;
        modality: ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[];
        open_weight: boolean;
        reasoning_support: boolean;
        function_calling: boolean;
        structured_output: boolean;
        vision_support: boolean;
        audio_support: boolean;
        image_generation: boolean;
        embedding_support: boolean;
        is_free?: boolean;
        tier?: 'free' | 'budget' | 'balanced' | 'premium';
        limits?: object;
        capability_ids?: string[];
        license_id?: string;
        status: 'active' | 'preview' | 'deprecated' | 'discontinued';
      } = {
        model_id: modelId,
        provider_id: 'cohere',
        name: raw.name,
        context_window: raw.context_length ?? undefined,
        modality,
        open_weight: false,
        reasoning_support: caps.reasoning_support,
        function_calling: caps.function_calling,
        structured_output: caps.structured_output,
        vision_support: caps.vision_support,
        audio_support: caps.audio_support,
        image_generation: caps.image_generation,
        embedding_support: caps.embedding_support,
        capability_ids: [],
        status: 'active',
      };

      result.models.push(model);
    }

    return result;
  },
} satisfies CustomGateway;
