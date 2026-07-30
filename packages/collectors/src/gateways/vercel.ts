import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const Schema = z.object({
  data: z.array(z.object({ id: z.string(), contextWindow: z.number().optional() })),
});
export default {
  type: 'custom',
  id: 'vercel',
  async collect(_s): Promise<CollectionResult> {
    const r: CollectionResult = { provider_id: 'vercel', models: [], errors: [] };
    try {
      const res = await fetch('https://ai-gateway.vercel.sh/v1/models');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = Schema.safeParse(await res.json());
      if (!p.success) {
        r.errors.push(p.error.message);
        return r;
      }
      for (const m of p.data.data)
        r.models.push({
          model_id: `vercel/${m.id}`,
          provider_id: 'vercel',
          name: m.id,
          context_window: m.contextWindow,
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
    } catch (e: unknown) {
      r.errors.push(e instanceof Error ? e.message : 'err');
    }
    return r;
  },
} satisfies CustomGateway;
