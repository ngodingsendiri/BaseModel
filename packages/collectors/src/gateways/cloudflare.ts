import type { Model } from '@basemodel/schema';
import { z } from 'zod';
import type { CollectionResult, CustomGateway } from '../core/collector';

type CloudflareModel = Model;

// Cloudflare Workers AI model catalog.
// Docs: https://developers.cloudflare.com/ai/models/
const CloudflareModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  task: z
    .object({
      id: z.string(),
      name: z.string().optional(),
    })
    .optional(),
});

const CloudflareResponseSchema = z.object({
  success: z.boolean(),
  result: z.array(CloudflareModelSchema),
  result_info: z
    .object({
      page: z.number(),
      per_page: z.number(),
      total_count: z.number(),
    })
    .optional(),
});

function toSlug(apiId: string): string {
  const lastSegment = (apiId.split('/').pop() ?? apiId).toLowerCase();
  const slug = lastSegment
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'model';
}

export default {
  type: 'custom',
  id: 'cloudflare',

  async collect(secrets): Promise<CollectionResult> {
    const result: CollectionResult = { provider_id: 'cloudflare', models: [], errors: [] };
    const accountId = secrets.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = secrets.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      result.errors.push(
        'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required. Add them to GitHub Secrets.',
      );
      return result;
    }

    try {
      let page = 1;
      for (;;) {
        const url = new URL(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`,
        );
        url.searchParams.set('page', String(page));
        url.searchParams.set('per_page', '100');

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(
              'HTTP 404: Cloudflare returned Not Found for the Workers AI catalog. ' +
                'Check that CLOUDFLARE_ACCOUNT_ID is correct, Workers AI is enabled on the ' +
                'account, and CLOUDFLARE_API_TOKEN has the Workers AI "AI Models" read permission.',
            );
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const raw = (await response.json()) as unknown;
        const parsed = CloudflareResponseSchema.safeParse(raw);
        if (!parsed.success) {
          result.errors.push(`Parse failed: ${parsed.error.message}`);
          return result;
        }
        if (!parsed.data.success) {
          result.errors.push('Cloudflare API returned success=false.');
          return result;
        }

        for (const m of parsed.data.result) {
          const slug = toSlug(m.id);
          // Workers AI reports the task type, which maps cleanly onto
          // modalities: generation tasks produce media, classification
          // tasks consume it (vision), and speech tasks handle audio.
          const taskId = (m.task?.id ?? '').toLowerCase();
          const isImageGen = taskId === 'text-to-image' || taskId === 'image-to-image';
          const isVision = taskId === 'image-classification' || taskId === 'object-detection';
          const isEmbedding = taskId.includes('embedding');
          const isSpeech = taskId.includes('speech') || taskId.includes('audio');

          const modality: CloudflareModel['modality'] = ['text'];
          if (isEmbedding) modality.push('embedding');
          else if (isImageGen || isVision) modality.push('image');
          if (isSpeech) modality.push('audio');

          result.models.push({
            model_id: `cloudflare/${slug}`,
            provider_id: 'cloudflare',
            name: m.name ?? m.id,
            description: m.description,
            status: 'active',
            modality,
            open_weight: true,
            reasoning_support: false,
            function_calling: false,
            structured_output: false,
            vision_support: isVision,
            audio_support: isSpeech,
            image_generation: isImageGen,
            embedding_support: isEmbedding,
          });
        }

        const info = parsed.data.result_info;
        if (!info || page * info.per_page >= info.total_count) break;
        page += 1;
      }
    } catch (e: unknown) {
      result.errors.push(e instanceof Error ? e.message : 'Unknown error');
    }

    return result;
  },
} satisfies CustomGateway;
