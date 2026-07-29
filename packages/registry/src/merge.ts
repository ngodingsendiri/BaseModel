import type { Model } from '@basemodel/schema';
import { ModelSchema } from '@basemodel/schema';
import { validate } from './validation';

/**
 * Safely merges data collected from an API (incoming) with the existing static data.
 * 
 * Rules:
 * - incoming data takes precedence for basic attributes (like context_window, status).
 * - existing data takes precedence for manually curated flags (like open_weight, capabilities)
 *   IF the incoming data doesn't explicitly provide them or if we want to preserve manual edits.
 * 
 * @param existing The existing model data from data/registry/models/... (can be null if it's a new model)
 * @param incoming The normalized partial model data from the collector
 */
export function mergeModelData(
  existing: Partial<Model> | null,
  incoming: Partial<Model>,
): { success: boolean; data?: Model; errors?: string[] } {
  // If it's a completely new model, we just use incoming.
  // Note: incoming might be missing required fields (like open_weight). 
  // We apply default safe values for new models so they pass validation, 
  // or we let them fail so a human knows they need curation.
  
  const base: Partial<Model> = existing || {
    // Default manual flags for new models (requires human curation later)
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

  // Merge: incoming overrides base for everything it explicitly provides
  const merged = { ...base };
  
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      // @ts-expect-error dynamic assignment
      merged[key] = value;
    }
  }

  // Preserve specifically curated array fields that APIs rarely return
  if (existing) {
    if (existing.capability_ids && existing.capability_ids.length > 0) {
      merged.capability_ids = existing.capability_ids;
    }
    if (existing.license_id) {
      merged.license_id = existing.license_id;
    }
  }

  // Validate the merged result
  const result = validate(ModelSchema, merged);
  if (result.success) {
    return { success: true, data: result.data as Model };
  } else {
    return { success: false, errors: result.errors };
  }
}
