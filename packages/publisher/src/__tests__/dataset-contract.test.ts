import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanonicalModelSchema, ModelSchema, OfferingSchema } from '@basemodel/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../generate';

/**
 * Dataset contract test.
 *
 * Runs the real generator against the real registry (no mocks) and asserts
 * the published datasets satisfy the contract consumers rely on: schema
 * validity, relational integrity, and consistent metadata. This guards the
 * nightly pipeline against silently publishing a broken snapshot.
 */

interface DatasetEnvelope {
  schema_version: string;
  generated_at: string;
  count: number;
}

interface PublishedModel {
  model_id: string;
  provider_id: string;
  capability_ids?: string[];
}

interface PublishedDatasets {
  providers: DatasetEnvelope & { providers: Array<{ provider_id: string }> };
  models: DatasetEnvelope & { models: PublishedModel[] };
  capabilities: DatasetEnvelope & { capabilities: Array<{ capability_id: string }> };
  licenses: DatasetEnvelope & { licenses: unknown[] };
  apis: DatasetEnvelope & { apis: unknown[] };
  benchmarks: DatasetEnvelope & { benchmarks: unknown[] };
  pricing: DatasetEnvelope & { pricing: unknown[] };
  intelligence: DatasetEnvelope & {
    intelligence: Array<{ model_id: string; alternatives?: Array<{ model_id: string }> }>;
  };
  metadata: DatasetEnvelope & {
    tier_definitions: Record<string, string>;
    blend: { formula: string };
    enrichment: unknown;
  };
}

async function loadDataset(outputDir: string, name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(outputDir, `${name}.json`), 'utf-8'));
}

describe('published dataset contract (real registry)', () => {
  let outputDir: string;
  let datasets: PublishedDatasets;

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'basemodel-contract-'));
    await generate(outputDir);

    datasets = {
      providers: (await loadDataset(outputDir, 'providers')) as PublishedDatasets['providers'],
      models: (await loadDataset(outputDir, 'models')) as PublishedDatasets['models'],
      capabilities: (await loadDataset(
        outputDir,
        'capabilities',
      )) as PublishedDatasets['capabilities'],
      licenses: (await loadDataset(outputDir, 'licenses')) as PublishedDatasets['licenses'],
      apis: (await loadDataset(outputDir, 'apis')) as PublishedDatasets['apis'],
      benchmarks: (await loadDataset(outputDir, 'benchmarks')) as PublishedDatasets['benchmarks'],
      pricing: (await loadDataset(outputDir, 'pricing')) as PublishedDatasets['pricing'],
      intelligence: (await loadDataset(
        outputDir,
        'intelligence',
      )) as PublishedDatasets['intelligence'],
      metadata: (await loadDataset(outputDir, 'metadata')) as PublishedDatasets['metadata'],
    };
  }, 120_000);

  afterAll(async () => {
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('emits every dataset file with consistent run metadata', () => {
    for (const [name, dataset] of Object.entries(datasets)) {
      expect(dataset.schema_version, `${name} missing schema_version`).toBeDefined();
      expect(dataset.generated_at, `${name} missing generated_at`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    const versions = new Set(Object.values(datasets).map((d) => d.schema_version));
    expect(versions.size).toBe(1);
  });

  it('counts match record arrays', () => {
    expect(datasets.providers.count).toBe(datasets.providers.providers.length);
    expect(datasets.models.count).toBe(datasets.models.models.length);
    expect(datasets.pricing.count).toBe(datasets.pricing.pricing.length);
    expect(datasets.intelligence.count).toBe(datasets.intelligence.intelligence.length);
  });

  it('every published model passes the canonical ModelSchema', () => {
    const parsed = ModelSchema.array().safeParse(datasets.models.models);
    if (!parsed.success) {
      // Surface the first few issues to make CI failures actionable.
      const sample = parsed.error.errors.slice(0, 5);
      throw new Error(`Invalid models in dataset: ${JSON.stringify(sample)}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('every model references a known provider and known capabilities', () => {
    const providerIds = new Set(datasets.providers.providers.map((p) => p.provider_id));
    const capabilityIds = new Set(datasets.capabilities.capabilities.map((c) => c.capability_id));
    for (const model of datasets.models.models) {
      expect(providerIds.has(model.provider_id), `${model.model_id} -> unknown provider`).toBe(
        true,
      );
      for (const cap of model.capability_ids ?? []) {
        expect(capabilityIds.has(cap), `${model.model_id} -> unknown capability ${cap}`).toBe(true);
      }
    }
  });

  it('intelligence records only reference catalog models', () => {
    const modelIds = new Set(datasets.models.models.map((m) => m.model_id));
    for (const record of datasets.intelligence.intelligence) {
      expect(modelIds.has(record.model_id)).toBe(true);
      for (const alt of record.alternatives ?? []) {
        expect(modelIds.has(alt.model_id)).toBe(true);
      }
    }
  });

  it('metadata carries tier definitions and enrichment status', () => {
    expect(datasets.metadata.tier_definitions).toBeDefined();
    expect(datasets.metadata.blend.formula).toContain('input');
    expect(datasets.metadata.enrichment).toBeDefined();
  });

  it('emits v2 canonical datasets that validate and reference each other', async () => {
    const v2Models = (await loadDataset(outputDir, 'v2/models')) as DatasetEnvelope & {
      models: unknown[];
    };
    const v2Offerings = (await loadDataset(outputDir, 'v2/offerings')) as DatasetEnvelope & {
      offerings: Array<{ model_id: string; offering_id: string }>;
    };

    const parsedModels = CanonicalModelSchema.array().safeParse(v2Models.models);
    if (!parsedModels.success) {
      throw new Error(
        `Invalid canonical models: ${JSON.stringify(parsedModels.error.errors.slice(0, 5))}`,
      );
    }
    const parsedOfferings = OfferingSchema.array().safeParse(v2Offerings.offerings);
    if (!parsedOfferings.success) {
      throw new Error(
        `Invalid offerings: ${JSON.stringify(parsedOfferings.error.errors.slice(0, 5))}`,
      );
    }

    // Every v1 offering appears exactly once in the v2 offering table.
    expect(v2Offerings.count).toBe(datasets.models.count);

    // Every offering resolves to a canonical model, and canonical offering_ids
    // stay within the offering table.
    const canonicalIds = new Set(parsedModels.data.map((m) => m.model_id));
    const offeringIds = new Set(v2Offerings.offerings.map((o) => o.offering_id));
    for (const offering of v2Offerings.offerings) {
      expect(
        canonicalIds.has(offering.model_id),
        `${offering.offering_id} -> unknown canonical`,
      ).toBe(true);
    }
    for (const canonical of parsedModels.data) {
      for (const offeringId of canonical.offering_ids) {
        expect(offeringIds.has(offeringId), `${canonical.model_id} -> unknown offering`).toBe(true);
      }
    }
  });

  it('publishes a SHA-256 manifest covering every dataset file', async () => {
    const manifest = (await loadDataset(outputDir, 'manifest')) as DatasetEnvelope & {
      files: Record<string, string>;
    };
    expect(manifest.files['models.json']).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files['v2/models.json']).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files['manifest.json']).toBeUndefined();
  });
});
