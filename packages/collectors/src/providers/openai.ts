import type { Model } from '@basemodel/schema';
import { z } from 'zod';
import type { CollectionResult, ModelCollector } from '../core/collector';

// Minimal Zod schema for OpenAI API response validation
const OpenAIModelResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      created: z.number(),
      owned_by: z.string(),
    }),
  ),
});

export class OpenAICollector implements ModelCollector {
  providerId = 'openai';

  async fetchModels(): Promise<CollectionResult> {
    const result: CollectionResult = {
      provider_id: this.providerId,
      models: [],
      errors: [],
    };

    // Note: In a real environment, we'd use process.env.OPENAI_API_KEY
    // But for discovery, the models endpoint is often open or requires a basic key.
    // If it fails without a key, we'll log it as an error.
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch('https://api.openai.com/v1/models', { headers });

      if (!response.ok) {
        throw new Error(`OpenAI API responded with status ${response.status}`);
      }

      const rawJson = (await response.json()) as unknown;

      // Validate raw payload strictly
      const parsed = OpenAIModelResponseSchema.safeParse(rawJson);

      if (!parsed.success) {
        result.errors.push(`Failed to parse OpenAI response: ${parsed.error.message}`);
        return result;
      }

      // Normalize
      for (const apiModel of parsed.data.data) {
        // Skip some internal/audio/tts models if desired, but here we collect all
        const normalized: Partial<Model> = {
          model_id: `${this.providerId}/${apiModel.id}`,
          provider_id: this.providerId,
          name: apiModel.id, // Better than nothing
          // Status heuristic: if it's returning, it's generally active
          status: 'active',
        };
        result.models.push(normalized);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        result.errors.push(error.message);
      } else {
        result.errors.push('An unknown error occurred');
      }
    }

    return result;
  }
}
