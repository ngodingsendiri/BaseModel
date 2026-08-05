import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';
import { classifyApiModel } from '../core/model-classify';

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
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}${body.trim() ? `: ${body.trim().slice(0, 200)}` : ''}`);
      }
      const p = Schema.safeParse(await res.json());
      if (!p.success) {
        r.errors.push(p.error.message);
        return r;
      }
      if (p.data.data.length === 0) {
        r.errors.push(
          'Portkey returned an empty model catalog. This is a known upstream issue ' +
            '(https://github.com/Portkey-AI/gateway/issues/1371); Portkey lists no models until ' +
            'a provider or virtual key is configured in the account.',
        );
        return r;
      }
      for (const m of p.data.data) {
        // Portkey reports no capability metadata, so modality and flags are
        // inferred from the (upstream) model id.
        const classification = classifyApiModel(m.id);
        r.models.push({
          model_id: `portkey/${m.id}`,
          provider_id: 'portkey',
          name: m.id,
          context_window: m.context_length,
          status: 'active',
          open_weight: false,
          function_calling: false,
          structured_output: false,
          ...classification,
        });
      }
    } catch (e: unknown) {
      r.errors.push(e instanceof Error ? e.message : 'err');
    }
    return r;
  },
} satisfies CustomGateway;
