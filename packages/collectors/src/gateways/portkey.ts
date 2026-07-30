import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

const Schema = z.object({
  data: z.array(z.object({ id: z.string(), context_length: z.number().optional() })),
});
export default {
  type: 'custom',
  id: 'portkey',
  async collect(secrets): Promise<CollectionResult> {
    const r: CollectionResult = { provider_id: 'portkey', models: [], errors: [] };
    const k = secrets.PORTKEY_API_KEY;
    if (!k) {
      r.errors.push('PORTKEY_API_KEY required');
      return r;
    }
    try {
      const res = await fetch('https://api.portkey.ai/v1/models', {
        headers: { 'x-portkey-api-key': k },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = Schema.safeParse(await res.json());
      if (!p.success) {
        r.errors.push(p.error.message);
        return r;
      }
      for (const m of p.data.data)
        r.models.push({
          model_id: `portkey/${m.id}`,
          provider_id: 'portkey',
          name: m.id,
          context_window: m.context_length,
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
