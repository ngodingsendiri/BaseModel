import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const rawModelSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()).nullable(),
  finetuned: z.boolean(),
  context_length: z.number().nullable(),
  tokenizer_url: z.string().nullable(),
  features: z.array(z.string()).nullable(),
  default_endpoints: z.array(z.string()).nullable(),
});

const rawResponseSchema = z.object({
  models: z.array(rawModelSchema),
});

function deriveModality(features: string[] | null | undefined): ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] {
  const f = features ?? [];
  const modalities: ('text' | 'image' | 'audio' | 'video' | 'code' | 'embedding')[] = ['text'];
  if (f.includes('vision')) modalities.push('image');
  if (f.includes('audio')) modalities.push('audio');
  if (f.includes('transcriptions')) modalities.push('audio');
  if (f.includes('embed')) modalities.push('embedding');
  return modalities;
}

function deriveCapabilities(features: string[] | null | undefined): string[] {
  const f = features ?? [];
  const caps: string[] = [];
  if (f.includes('reasoning')) caps.push('reasoning');
  if (f.includes('tools')) caps.push('function_calling');
  if (f.includes('json_mode') || f.includes('json_schema')) caps.push('structured_output');
  if (f.includes('vision')) caps.push('vision_support');
  if (f.includes('logprobs')) caps.push('logprobs');
  if (f.includes('citations')) caps.push('citations');
  if (f.includes('safety_modes')) caps.push('safety_modes');
  if (f.includes('transcriptions')) caps.push('audio_support');
  if (f.includes('embed')) caps.push('embedding_support');
  return caps;
}

function deriveBooleanFlags(features: string[] | null | undefined): {
  reasoning_support: boolean;
  function_calling: boolean;
  structured_output: boolean;
  vision_support: boolean;
  audio_support: boolean;
  image_generation: boolean;
  embedding_support: boolean;
} {
  const f = features ?? [];
  return {
    reasoning_support: f.includes('reasoning'),
    function_calling: f.includes('tools'),
    structured_output: f.includes('json_mode') || f.includes('json_schema'),
    vision_support: f.includes('vision'),
    audio_support: f.includes('transcriptions'),
    image_generation: false,
    embedding_support: f.includes('embed'),
  };
}

export default {
  type: 'custom',
  id: 'cohere',
  async collect(secrets: Record<string, string | undefined>): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'cohere', models: [], errors: [] };
    const apiKey = secrets['COHERE_API_KEY'];
    if (!apiKey) {
      result.errors.push('COHERE_API_KEY secret is missing');
      return result;
    }

    const url = 'https://api.cohere.com/v1/models';
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown fetch error';
      result.errors.push(`Failed to fetch models: ${message}`);
      return result;
    }

    if (!response.ok) {
      result.errors.push(`HTTP ${response.status}: ${response.statusText}`);
      return result;
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parse error';
      result.errors.push(`Failed to parse JSON: ${message}`);
      return result;
    }

    const parsed = rawResponseSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(`Invalid response shape: ${parsed.error.issues.map(i => i.message).join(', ')}`);
      return result;
    }

    for (const rawModel of parsed.data.models) {
      const slug = slugify(rawModel.name);
      const modelId = `cohere/${slug}`;
      const features = rawModel.features ?? undefined;
      const modality = deriveModality(features);
      const caps = deriveCapabilities(features);
      const flags = deriveBooleanFlags(features);

      const contextWindow = typeof rawModel.context_length === 'number' && rawModel.context_length > 0
        ? rawModel.context_length
        : undefined;

      const model = {
        model_id: modelId,
        provider_id: 'cohere',
        name: rawModel.name,
        family: rawModel.name.split('-').slice(0, -1).join('-') || undefined,
        version: rawModel.name.split('-').pop() || undefined,
        description: rawModel.name,
        architecture: 'unknown',
        parameter_size: undefined,
        context_window: contextWindow,
        modality,
        open_weight: false,
        reasoning_support: flags.reasoning_support,
        function_calling: flags.function_calling,
        structured_output: flags.structured_output,
        vision_support: flags.vision_support,
        audio_support: flags.audio_support,
        image_generation: flags.image_generation,
        embedding_support: flags.embedding_support,
        is_free: undefined,
        tier: undefined,
        limits: undefined,
        capability_ids: caps,
        license_id: undefined,
        status: 'active' as const,
      };

      result.models.push(model);
    }

    return result;
  },
} satisfies CustomGateway;
