import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const Schema = z.object({
  data: z.array(z.object({ id: z.string(), max_tokens: z.number().optional() })),
});
export default {
  type: 'custom',
  id: 'litellm',
  async collect(secrets): Promise<CollectionResult> {
    const r: CollectionResult = { provider_id: 'litellm', models: [], errors: [] };
    const base = secrets.LITELLM_BASE_URL;
    const key = secrets.LITELLM_API_KEY;
    if (!base) {
      r.errors.push('LITELLM_BASE_URL is required');
      return r;
    }
    try {
      const url = base.replace(/\/$/, '') + '/v1/models';
      const h: Record<string, string> = {};
      if (key) h.Authorization = `Bearer ${key}`;
      const res = await fetch(url, { headers: h });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = Schema.safeParse(await res.json());
      if (!p.success) {
        r.errors.push(p.error.message);
        return r;
      }
      for (const m of p.data.data)
        r.models.push({
          model_id: `litellm/${m.id}`,
          provider_id: 'litellm',
          name: m.id,
          context_window: m.max_tokens,
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
