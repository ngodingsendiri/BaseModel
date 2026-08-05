/**
 * One-off registry repair for capability flags written by older gateway
 * versions whose heuristics were wrong:
 *
 * - google: `function_calling`/`structured_output` were derived from the
 *   `generateContent` method, which every listing entry carries, flagging
 *   non-Gemini models (antigravity, deep-research, embeddings) incorrectly.
 * - anthropic: Claude models were stored as text-only with no tool support,
 *   although every current Claude model accepts images and supports tools.
 *
 * Replays the fixed gateway mappings onto stored records. Providers whose
 * catalogs can be re-collected publicly (vercel, requesty) are repaired by
 * running `pnpm collect` instead.
 */
import { getAllModels, saveModel } from '@basemodel/registry';
import type { Model } from '@basemodel/schema';
import { classifyApiModel } from '../core/model-classify.js';

const repairs: Record<string, (model: Model) => void> = {
  // Tool support belongs to Gemini chat models only.
  google: (model) => {
    const isGemini = model.model_id.includes('gemini');
    model.function_calling = isGemini;
    model.structured_output = isGemini;
  },
  // Replay the fixed gateway mapping from the model slug.
  anthropic: (model) => {
    const slug = model.model_id.split('/').pop() ?? model.model_id;
    const classification = classifyApiModel(slug);
    model.modality = classification.modality;
    model.vision_support = classification.vision_support;
    model.function_calling = true;
    model.structured_output = true;
  },
};

const models = await getAllModels();
let updated = 0;

// Modality/flag consistency: capability flags imply their modality being
// listed. Older collections stored vision/audio/embedding-capable models
// with a text-only modality array.
function alignModality(model: Model): void {
  const needs = new Set<Model['modality'][number]>();
  if (model.vision_support) needs.add('image');
  if (model.image_generation) needs.add('image');
  if (model.audio_support) needs.add('audio');
  if (model.embedding_support) needs.add('embedding');
  for (const modality of needs) {
    if (!model.modality.includes(modality)) model.modality.push(modality);
  }
}

for (const model of models) {
  const previous = JSON.stringify(model);
  const repair = repairs[model.provider_id];
  if (repair) repair(model);
  alignModality(model);
  if (JSON.stringify(model) === previous) continue;
  await saveModel(model);
  updated += 1;
}

console.log(`Checked ${models.length} records, updated ${updated}.`);
