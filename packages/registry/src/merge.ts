import type { Model } from '@basemodel/schema';
import { ModelSchema } from '@basemodel/schema';
import { validate } from './validation';

/**
 * Merges normalized collector data with existing curated model data.
 */
export function mergeModelData(
  existing: Partial<Model> | null,
  incoming: Partial<Model>,
): { success: boolean; data?: Model; errors?: string[] } {
  const base: Partial<Model> = existing || {
    open_weight: false,
    reasoning_support: false,
    function_calling: false,
    structured_output: false,
    vision_support: false,
    audio_support: false,
    image_generation: false,
    embedding_support: false,
    modality: ['text'],
    status: 'active',
  };

  const merged = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  if (existing) {
    if (existing.capability_ids && existing.capability_ids.length > 0) {
      merged.capability_ids = existing.capability_ids;
    }
    if (existing.license_id) {
      merged.license_id = existing.license_id;
    }
  }

  const result = validate(ModelSchema, merged);
  if (result.success) {
    return { success: true, data: result.data as Model };
  }
  return { success: false, errors: result.errors };
}
