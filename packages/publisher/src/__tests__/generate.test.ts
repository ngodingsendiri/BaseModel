import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Model, Pricing, Provider } from '@basemodel/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registry = vi.hoisted(() => ({
  getAllApis: vi.fn(),
  getAllBenchmarks: vi.fn(),
  getAllCapabilities: vi.fn(),
  getAllLicenses: vi.fn(),
  getAllModels: vi.fn(),
  getAllPricing: vi.fn(),
  getAllProviders: vi.fn(),
  readRegistryFile: vi.fn(),
}));

const intelligence = vi.hoisted(() => ({
  IntelligenceEngine: vi.fn(),
  calculateCostEfficiency: vi.fn(),
  findAlternatives: vi.fn(),
}));

vi.mock('@basemodel/registry', () => registry);
vi.mock('@basemodel/intelligence', () => intelligence);

import { generate, getSourceRevision, getWorkspaceRoot } from '../generate';

function sampleProvider(): Provider {
  return {
    provider_id: 'openai',
    name: 'OpenAI',
    organization: 'OpenAI',
    website: 'https://openai.com',
    provider_type: 'first-party',
    status: 'active',
  };
}

function sampleModel(overrides: Partial<Model> = {}): Model {
  return {
    model_id: 'openai/gpt-4o',
    provider_id: 'openai',
    name: 'gpt-4o',
    modality: ['text'],
    open_weight: false,
    reasoning_support: false,
    function_calling: false,
    structured_output: false,
    vision_support: false,
    audio_support: false,
    image_generation: false,
    embedding_support: false,
    capability_ids: [],
    status: 'active',
    ...overrides,
  };
}

function samplePricing(overrides: Partial<Pricing> = {}): Pricing {
  return {
    pricing_id: 'gpt-4o-in',
    model_id: 'openai/gpt-4o',
    pricing_type: 'input-token',
    currency: 'USD',
    unit: '1M tokens',
    value: 5.0,
    ...overrides,
  };
}

describe('generate', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = '';
    vi.clearAllMocks();
    registry.getAllApis.mockResolvedValue([]);
    registry.getAllBenchmarks.mockResolvedValue([]);
    registry.getAllCapabilities.mockResolvedValue([]);
    registry.getAllLicenses.mockResolvedValue([]);
    registry.getAllModels.mockResolvedValue([sampleModel()]);
    registry.getAllPricing.mockResolvedValue([samplePricing()]);
    registry.getAllProviders.mockResolvedValue([sampleProvider()]);
    registry.readRegistryFile.mockResolvedValue(null);
    intelligence.calculateCostEfficiency.mockReturnValue({
      modelId: 'openai/gpt-4o',
      isFree: false,
      inputCostPer1M: 5.0,
      outputCostPer1M: 15.0,
      blendedCost: 7.5,
      tier: 'Premium',
    });
    intelligence.findAlternatives.mockReturnValue([]);
  });

  afterEach(async () => {
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('resolves the workspace root to the basemodel package root', () => {
    expect(getWorkspaceRoot()).toMatch(/basemodel-view$|BaseModel$|basemodel$/i);
  });

  it('returns a short git revision or falls back to unknown', () => {
    const revision = getSourceRevision();
    expect(revision.length).toBeGreaterThan(0);
  });

  it('writes all dataset files with metadata and counts', async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'basemodel-generate-'));
    await generate(outputDir);

    const providers = JSON.parse(await readFile(join(outputDir, 'providers.json'), 'utf-8'));
    const models = JSON.parse(await readFile(join(outputDir, 'models.json'), 'utf-8'));
    const capabilities = JSON.parse(await readFile(join(outputDir, 'capabilities.json'), 'utf-8'));
    const licenses = JSON.parse(await readFile(join(outputDir, 'licenses.json'), 'utf-8'));
    const apis = JSON.parse(await readFile(join(outputDir, 'apis.json'), 'utf-8'));
    const benchmarks = JSON.parse(await readFile(join(outputDir, 'benchmarks.json'), 'utf-8'));
    const pricing = JSON.parse(await readFile(join(outputDir, 'pricing.json'), 'utf-8'));
    const intelligenceOut = JSON.parse(
      await readFile(join(outputDir, 'intelligence.json'), 'utf-8'),
    );
    const metadata = JSON.parse(await readFile(join(outputDir, 'metadata.json'), 'utf-8'));

    expect(providers.schema_version).toBe('0.1.0');
    expect(providers.count).toBe(1);
    expect(providers.providers[0]?.provider_id).toBe('openai');
    expect(providers.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(models.count).toBe(1);
    expect(models.models[0]?.model_id).toBe('openai/gpt-4o');
    expect(capabilities.count).toBe(0);
    expect(licenses.count).toBe(0);
    expect(apis.count).toBe(0);
    expect(benchmarks.count).toBe(0);
    expect(pricing.count).toBe(1);
    expect(intelligenceOut.count).toBe(1);
    expect(intelligenceOut.intelligence[0]?.cost_tier).toBe('Premium');
    expect(intelligenceOut.intelligence[0]?.blended_cost_per_1m).toBe(7.5);
    expect(metadata.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.tier_definitions.free).toBeDefined();
    expect(metadata.enrichment).toEqual({});
  });

  it('throws when a model references an unknown provider', async () => {
    registry.getAllModels.mockResolvedValue([sampleModel({ provider_id: 'unknown-provider' })]);
    outputDir = await mkdtemp(join(tmpdir(), 'basemodel-generate-'));
    await expect(generate(outputDir)).rejects.toThrow(/unknown provider/);
  });

  it('throws when a model references an unknown capability', async () => {
    registry.getAllModels.mockResolvedValue([sampleModel({ capability_ids: ['nope'] })]);
    outputDir = await mkdtemp(join(tmpdir(), 'basemodel-generate-'));
    await expect(generate(outputDir)).rejects.toThrow(/unknown capability/);
  });
});
