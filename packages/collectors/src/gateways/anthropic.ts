import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

// Anthropic uses a different auth header pattern and has its own field names
const AnthropicResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_name: z.string().optional(),
      created_at: z.string().optional(),
    }),
  ),
});

export default {
  type: 'custom',
  id: 'anthropic',

  async collect(secrets): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'anthropic', models: [], errors: [] };
    const apiKey = secrets.ANTHROPIC_API_KEY;

    if (!apiKey) {
      result.errors.push('ANTHROPIC_API_KEY is required. Please add it to GitHub Secrets.');
      return result;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const raw = (await response.json()) as unknown;
      const parsed = AnthropicResponseSchema.safeParse(raw);

      if (!parsed.success) {
        result.errors.push(`Parse failed: ${parsed.error.message}`);
        return result;
      }

      for (const m of parsed.data.data) {
        result.models.push({
          model_id: `anthropic/${m.id}`,
          provider_id: 'anthropic',
          name: m.display_name ?? m.id,
          release_date: m.created_at ? m.created_at.split('T')[0] : undefined,
          status: 'active',
          modality: ['text'],
          open_weight: false,
          reasoning_support: false,
          function_calling: false,
          structured_output: false,
          vision_support: false,
          audio_support: false,
          image_generation: false,
          embedding_support: false,
        });
      }
    } catch (e: unknown) {
      result.errors.push(e instanceof Error ? e.message : 'Unknown error');
    }

    return result;
  },
} satisfies CustomGateway;
