import { getAllModels, saveModel } from '@basemodel/registry';
import type { Model } from '@basemodel/schema';
import { classifyApiModel } from '../core/model-classify.js';

/**
 * One-off reclassification of registry records collected before
 * classifyApiModel() existed (they were all stored as plain text models).
 *
 * Safety rails — a record is only touched when:
 *   1. it still looks like the naive collector default (modality ['text'],
 *      every capability flag false), AND
 *   2. it carries no curation markers (no description, capability_ids, or
 *      license_id), so curated records are never overwritten.
 *
 * Usage: pnpm --filter @basemodel/collectors reclassify [--dry-run]
 */

const CLASSIFICATION_FIELDS = [
  'modality',
  'embedding_support',
  'audio_support',
  'image_generation',
  'vision_support',
  'reasoning_support',
] as const;

function isNaiveDefault(model: Model): boolean {
  const hasOnlyText = model.modality.length === 1 && model.modality[0] === 'text';
  const noFlags =
    !model.embedding_support &&
    !model.audio_support &&
    !model.image_generation &&
    !model.vision_support &&
    !model.reasoning_support;
  const notCurated =
    !model.description && (model.capability_ids ?? []).length === 0 && !model.license_id;
  return hasOnlyText && noFlags && notCurated;
}

function currentClassification(model: Model): Record<string, unknown> {
  return Object.fromEntries(CLASSIFICATION_FIELDS.map((field) => [field, model[field]]));
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const models = await getAllModels();

  let scanned = 0;
  let updated = 0;
  for (const model of models) {
    if (!isNaiveDefault(model)) continue;
    scanned += 1;

    // Prefer the raw upstream id (kept in `name`) over the normalized slug.
    const rawId = model.name || (model.model_id.split('/').pop() ?? model.model_id);
    const classification = classifyApiModel(rawId);
    const current = currentClassification(model);
    const changed = JSON.stringify(classification) !== JSON.stringify(current);
    if (!changed) continue;

    updated += 1;
    console.log(
      `${dryRun ? '[dry-run] ' : ''}${model.model_id}: modality ${JSON.stringify(current.modality)} -> ${JSON.stringify(classification.modality)}`,
    );
    if (!dryRun) {
      await saveModel({ ...model, ...classification });
    }
  }

  console.log('');
  console.log(
    `Scanned ${scanned} naive-default records, ${updated} ${dryRun ? 'would change' : 'updated'}.`,
  );
}

main().catch((error) => {
  console.error('Reclassification failed:', error);
  process.exitCode = 1;
});
