import type { Model } from '@basemodel/schema';
import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';
import { classifyApiModel } from '../core/model-classify';
import { toModelSlug } from '../core/slug';

/**
 * Vercel AI Gateway model catalog.
 * Docs: https://vercel.com/docs/ai-gateway
 *
 * The public catalog carries per-model capability metadata (`type`, `tags`,
 * `context_window`, `description`), which maps directly onto our schema —
 * no id heuristics needed for the fields Vercel publishes. Id heuristics
 * only fill gaps the catalog leaves open.
 */
const Schema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      context_window: z.number().optional(),
      type: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});

export default {
  type: 'custom',
  id: 'vercel',
  async collect(_s): Promise<CollectionResult> {
    const r: CollectionResult = { provider_id: 'vercel', models: [], errors: [] };
    try {
      const res = await fetch('https://ai-gateway.vercel.sh/v1/models', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = Schema.safeParse(await res.json());
      if (!p.success) {
        r.errors.push(p.error.message);
        return r;
      }
      for (const m of p.data.data) {
        const tags = new Set(m.tags ?? []);
        const classification = classifyApiModel(m.id);

        const isEmbedding = m.type === 'embedding' || m.type === 'reranking';
        const isImageGen = m.type === 'image' || tags.has('image-generation');
        const isVideoGen = m.type === 'video' || tags.has('video-generation');
        const isAudio = m.type === 'transcription' || m.type === 'speech' || m.type === 'realtime';
        const vision =
          tags.has('vision') || (m.type === 'language' && classification.vision_support);

        const modalitySet = new Set<Model['modality'][number]>(['text']);
        if (isEmbedding) modalitySet.add('embedding');
        else if (isImageGen || isVideoGen) modalitySet.add('image');
        else if (isAudio) modalitySet.add('audio');
        else if (vision) modalitySet.add('image');
        if (isVideoGen) modalitySet.add('video');

        r.models.push({
          model_id: `vercel/${toModelSlug(m.id)}`,
          provider_id: 'vercel',
          name: m.name ?? m.id,
          description: m.description,
          // Media/embedding models report 0; the schema only accepts real
          // token windows, so map non-positive values to "unknown".
          context_window: m.context_window && m.context_window > 0 ? m.context_window : undefined,
          status: 'active',
          modality: [...modalitySet],
          open_weight: false,
          reasoning_support: tags.has('reasoning') || classification.reasoning_support,
          function_calling: tags.has('tool-use'),
          structured_output: tags.has('tool-use'),
          vision_support: vision,
          audio_support: isAudio || classification.audio_support,
          image_generation: isImageGen || classification.image_generation,
          embedding_support: isEmbedding || classification.embedding_support,
        });
      }
    } catch (e: unknown) {
      r.errors.push(e instanceof Error ? e.message : 'err');
    }
    return r;
  },
} satisfies CustomGateway;
