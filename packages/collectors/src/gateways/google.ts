import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

// Google AI Studio / Gemini Developer API model listing.
// Docs: https://ai.google.dev/gemini-api/docs/models
const GeminiModelSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  inputTokenLimit: z.number().int().min(0).optional(),
  outputTokenLimit: z.number().int().positive().optional(),
  supportedGenerationMethods: z.array(z.string()).optional(),
  version: z.string().optional(),
});

const GeminiListResponseSchema = z.object({
  models: z.array(GeminiModelSchema).optional(),
});

function toSlug(apiName: string): string {
  const lastSegment = (apiName.split('/').pop() ?? apiName).toLowerCase();
  const slug = lastSegment
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'model';
}

export default {
  type: 'custom',
  id: 'google',

  async collect(secrets): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'google', models: [], errors: [] };
    const apiKey = secrets.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      result.errors.push('GOOGLE_AI_API_KEY is required. Please add it to GitHub Secrets.');
      return result;
    }

    try {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('key', apiKey);

      const response = await fetch(url, {
        headers: { 'x-goog-api-client': 'basemodel/0.1' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const raw = (await response.json()) as unknown;
      const parsed = GeminiListResponseSchema.safeParse(raw);
      if (!parsed.success) {
        result.errors.push(`Parse failed: ${parsed.error.message}`);
        return result;
      }

      for (const m of parsed.data.models ?? []) {
        const slug = toSlug(m.name);
        const methods = m.supportedGenerationMethods ?? [];
        const lowerName = m.name.toLowerCase();
        const isGemini = lowerName.includes('gemini');
        const isImageModel = lowerName.includes('imagen');
        const isEmbedding = lowerName.includes('embedding');

        result.models.push({
          model_id: `google/${slug}`,
          provider_id: 'google',
          name: m.displayName ?? slug,
          description: m.description,
          context_window: m.inputTokenLimit,
          release_date: undefined,
          status: 'active',
          modality: isImageModel
            ? ['text', 'image']
            : isEmbedding
              ? ['text']
              : isGemini
                ? ['text', 'image', 'audio', 'video']
                : ['text'],
          open_weight: false,
          reasoning_support: isGemini && lowerName.includes('thinking'),
          // `generateContent` is the base generation method every listing
          // entry carries, so it cannot signal tool support; only Gemini
          // chat models expose function calling / structured output.
          function_calling: isGemini,
          structured_output: isGemini,
          vision_support: isGemini && !isEmbedding,
          audio_support: isGemini && !isEmbedding,
          image_generation:
            isImageModel || methods.some((method) => method.toLowerCase().includes('image')),
          embedding_support: isEmbedding || methods.includes('embedContent'),
        });
      }
    } catch (e: unknown) {
      result.errors.push(e instanceof Error ? e.message : 'Unknown error');
    }

    return result;
  },
} satisfies CustomGateway;
