import { z } from 'zod';
import type { ModelCollector, CollectionResult } from '../core/collector';
import type { Model } from '@basemodel/schema';

// Minimal Zod schema for Anthropic API response validation
const AnthropicModelResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_name: z.string().optional(),
      created_at: z.string().optional(),
    })
  ),
});

export class AnthropicCollector implements ModelCollector {
  providerId = 'anthropic';

  async fetchModels(): Promise<CollectionResult> {
    const result: CollectionResult = {
      provider_id: this.providerId,
      models: [],
      errors: [],
    };

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required to fetch models from Anthropic');
      }

      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Anthropic API responded with status ${response.status}`);
      }

      const rawJson = await response.json() as unknown;
      
      // Validate raw payload strictly
      const parsed = AnthropicModelResponseSchema.safeParse(rawJson);
      
      if (!parsed.success) {
        result.errors.push(`Failed to parse Anthropic response: ${parsed.error.message}`);
        return result;
      }

      // Normalize
      for (const apiModel of parsed.data.data) {
        const normalized: Partial<Model> = {
          model_id: `${this.providerId}/${apiModel.id}`,
          provider_id: this.providerId,
          name: apiModel.display_name || apiModel.id,
          // Extract release date if possible
          release_date: apiModel.created_at ? apiModel.created_at.split('T')[0] : undefined,
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
