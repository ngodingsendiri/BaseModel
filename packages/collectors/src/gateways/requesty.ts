import type { Model } from '@basemodel/schema';
import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';
import { classifyApiModel } from '../core/model-classify';
import { toModelSlug } from '../core/slug';

/**
 * Requesty — AI model router with cost optimization.
 * Docs: https://docs.requesty.ai/api-reference/endpoint/models-list
 *
 * `/v1/models` is public: without authentication it returns the full public
 * catalog with rich per-model metadata (capability flags, context window,
 * description, retirement date). We therefore collect unauthenticated to get
 * the complete catalog; REQUESTY_API_KEY would narrow results to the
 * organization's approved models.
 *
 * Declares the same endpoint as `pricingSource` so the enrich step can price
 * `requesty/*` models with Requesty's own resale rates.
 */

const RequestyModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  context_window: z.number().optional(),
  released: z.number().optional(),
  retires_at: z.string().nullable().optional(),
  supports_vision: z.boolean().optional(),
  supports_reasoning: z.boolean().optional(),
  supports_tool_calling: z.boolean().optional(),
  supports_output_json_schema: z.boolean().optional(),
  supports_image_generation: z.boolean().optional(),
});

const RequestyResponseSchema = z.object({
  data: z.array(RequestyModelSchema),
});

export default {
  type: 'custom',
  id: 'requesty',
  pricingSource: {
    url: 'https://router.requesty.ai/v1/models',
    auth: 'none',
  },

  async collect(_secrets): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'requesty', models: [], errors: [] };
    try {
      const response = await fetch('https://router.requesty.ai/v1/models', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const parsed = RequestyResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        result.errors.push(`Parse failed: ${parsed.error.message}`);
        return result;
      }

      for (const m of parsed.data.data) {
        const slug = toModelSlug(m.id);
        // Conservative id heuristics fill the gaps where Requesty publishes
        // no capability flag (e.g. audio or embedding models).
        const classification = classifyApiModel(m.id);
        const vision = m.supports_vision ?? classification.vision_support;

        const modalitySet = new Set<Model['modality'][number]>(['text']);
        if (vision) modalitySet.add('image');
        if (classification.embedding_support) modalitySet.add('embedding');
        if (classification.audio_support) modalitySet.add('audio');
        if (classification.image_generation || m.supports_image_generation)
          modalitySet.add('image');
        const modality = [...modalitySet];

        // Models past their retirement date fail requests upstream.
        let status: Model['status'] = 'active';
        if (m.retires_at && new Date(m.retires_at).getTime() < Date.now()) {
          status = 'discontinued';
        }

        result.models.push({
          model_id: `requesty/${slug}`,
          provider_id: 'requesty',
          name: m.name ?? m.id,
          description: m.description,
          context_window: m.context_window,
          release_date: m.released
            ? new Date(m.released * 1000).toISOString().slice(0, 10)
            : undefined,
          status,
          modality,
          open_weight: false,
          reasoning_support: m.supports_reasoning ?? classification.reasoning_support,
          function_calling: m.supports_tool_calling ?? false,
          structured_output: m.supports_output_json_schema ?? false,
          vision_support: vision,
          audio_support: classification.audio_support,
          image_generation: m.supports_image_generation ?? classification.image_generation,
          embedding_support: classification.embedding_support,
        });
      }
    } catch (e: unknown) {
      result.errors.push(e instanceof Error ? e.message : 'Unknown error');
    }
    return result;
  },
} satisfies CustomGateway;
