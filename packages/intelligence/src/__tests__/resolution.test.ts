import type { Benchmark, Model, Pricing, Provider } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import { IntelligenceEngine } from '../core/engine';
import { canonicalSlug, computeQuality, resolveCanonicalModels } from '../core/resolution';
import { bestModels, buildV2Snapshot } from '../features/v2';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<Model> & Pick<Model, 'model_id'>): Model {
  const providerId = overrides.provider_id ?? overrides.model_id.split('/')[0] ?? 'openai';
  const base: Model = {
    model_id: overrides.model_id,
    provider_id: providerId,
    name: overrides.name ?? overrides.model_id.split('/').pop() ?? overrides.model_id,
    status: 'active',
    open_weight: false,
    function_calling: false,
    structured_output: false,
    modality: ['text'],
    capability_ids: [],
    reasoning_support: false,
    vision_support: false,
    audio_support: false,
    image_generation: false,
    embedding_support: false,
  };
  return { ...base, ...overrides };
}

function makeProvider(providerId: string): Provider {
  return {
    provider_id: providerId,
    name: providerId,
    organization: providerId,
    website: `https://${providerId}.example.com`,
    provider_type: 'first-party',
    status: 'active',
  };
}

function makePricing(
  modelId: string,
  type: 'input-token' | 'output-token',
  value: number,
): Pricing {
  return {
    pricing_id: `${modelId}-${type}`,
    model_id: modelId,
    pricing_type: type,
    currency: 'USD',
    unit: '1M tokens',
    value,
    source: modelId.split('/')[0],
  };
}

function makeBenchmark(modelId: string, score: number, categories: string[]): Benchmark {
  return {
    benchmark_id: `${modelId}-${score}`,
    model_id: modelId,
    benchmark_name: 'test-bench',
    score,
    source: 'openllm',
    category: categories,
  };
}

// ─── canonicalSlug ───────────────────────────────────────────────────────────

describe('canonicalSlug', () => {
  it('strips the provider prefix', () => {
    expect(canonicalSlug('openai/gpt-4o')).toBe('gpt-4o');
  });

  it('normalizes dots to dashes', () => {
    expect(canonicalSlug('deepinfra/gemini-2.5-pro')).toBe('gemini-2-5-pro');
  });

  it('handles router re-serve paths with embedded provider', () => {
    expect(canonicalSlug('openrouter/openai/gpt-4o')).toBe('gpt-4o');
  });
});

// ─── resolveCanonicalModels ──────────────────────────────────────────────────

describe('resolveCanonicalModels', () => {
  it('groups offerings of one physical model into one canonical record', () => {
    const { canonicals, mapping } = resolveCanonicalModels([
      makeModel({ model_id: 'openai/gpt-4o', context_window: 128000 }),
      makeModel({ model_id: 'vercel/gpt-4o', context_window: 128000 }),
      makeModel({ model_id: 'openrouter/openai/gpt-4o' }),
    ]);

    expect(canonicals).toHaveLength(1);
    const canonical = canonicals[0];
    expect(canonical?.model_id).toBe('gpt-4o');
    expect(canonical?.offering_ids).toEqual([
      'openai/gpt-4o',
      'openrouter/openai/gpt-4o',
      'vercel/gpt-4o',
    ]);
    expect(mapping.get('vercel/gpt-4o')).toBe('gpt-4o');
    expect(mapping.get('openrouter/openai/gpt-4o')).toBe('gpt-4o');
  });

  it('merges attributes: modality union, flag OR, best context, best status', () => {
    const { canonicals } = resolveCanonicalModels([
      makeModel({
        model_id: 'openai/gpt-4o',
        modality: ['text', 'image'],
        vision_support: true,
        context_window: 128000,
        status: 'discontinued',
      }),
      makeModel({
        model_id: 'vercel/gpt-4o',
        function_calling: true,
        context_window: 32000,
        status: 'active',
      }),
    ]);

    const canonical = canonicals[0];
    expect(canonical?.modality).toEqual(['text', 'image']);
    expect(canonical?.vision_support).toBe(true);
    expect(canonical?.function_calling).toBe(true);
    expect(canonical?.context_window).toBe(128000);
    expect(canonical?.status).toBe('active');
  });

  it('prefers first-party providers for descriptive fields', () => {
    const { canonicals } = resolveCanonicalModels([
      makeModel({ model_id: 'vercel/gpt-4o', name: 'Vercel re-serve' }),
      makeModel({ model_id: 'openai/gpt-4o', name: 'GPT-4o', description: 'The real one' }),
    ]);
    const canonical = canonicals[0];
    expect(canonical?.name).toBe('GPT-4o');
    expect(canonical?.description).toBe('The real one');
  });
});

// ─── computeQuality ──────────────────────────────────────────────────────────

describe('computeQuality', () => {
  it('averages benchmark scores and unions categories/sources', () => {
    const { canonicals } = resolveCanonicalModels([makeModel({ model_id: 'openai/gpt-4o' })]);
    computeQuality(canonicals, [
      makeBenchmark('gpt-4o', 90, ['general']),
      makeBenchmark('gpt-4o', 80, ['coding']),
    ]);

    const canonical = canonicals[0];
    expect(canonical?.quality?.score).toBe(85);
    expect(canonical?.quality?.benchmark_count).toBe(2);
    expect(canonical?.quality?.categories).toEqual(['coding', 'general']);
    expect(canonical?.quality?.sources).toEqual(['openllm']);
  });

  it('leaves quality absent when no benchmark matches', () => {
    const { canonicals } = resolveCanonicalModels([makeModel({ model_id: 'openai/gpt-4o' })]);
    computeQuality(canonicals, [makeBenchmark('some-other-model', 90, ['general'])]);
    expect(canonicals[0]?.quality).toBeUndefined();
  });
});

// ─── buildV2Snapshot + bestModels ────────────────────────────────────────────

describe('v2 snapshot economics', () => {
  function hydratedEngine(benchmarks: Benchmark[], pricing: Pricing[]): IntelligenceEngine {
    const engine = new IntelligenceEngine();
    engine.hydrate({
      models: [
        makeModel({ model_id: 'openai/model-a', context_window: 200000 }),
        makeModel({ model_id: 'vercel/model-a' }),
        makeModel({ model_id: 'openai/model-b', context_window: 100000 }),
        makeModel({ model_id: 'openai/model-c', context_window: 50000 }),
      ],
      providers: [makeProvider('openai'), makeProvider('vercel')],
      pricing,
      benchmarks,
    });
    return engine;
  }

  const pricing: Pricing[] = [
    makePricing('openai/model-a', 'input-token', 2),
    makePricing('openai/model-a', 'output-token', 6),
    makePricing('vercel/model-a', 'input-token', 3),
    makePricing('vercel/model-a', 'output-token', 9),
    makePricing('openai/model-b', 'input-token', 0.5),
    makePricing('openai/model-b', 'output-token', 1.5),
    makePricing('openai/model-c', 'input-token', 4),
    makePricing('openai/model-c', 'output-token', 12),
  ];

  const benchmarks: Benchmark[] = [
    makeBenchmark('model-a', 90, ['general']),
    makeBenchmark('model-b', 80, ['general', 'coding']),
    makeBenchmark('model-c', 70, ['general']),
  ];

  it('marks the cheapest active offering per canonical model', () => {
    const snapshot = buildV2Snapshot(hydratedEngine(benchmarks, pricing));
    const cheapest = snapshot.offerings.filter((o) => o.is_cheapest);
    // Every canonical model gets exactly one cheapest offering; for model-a
    // the cheaper first-party serve wins over the pricier re-serve.
    expect(cheapest.map((o) => o.offering_id)).toEqual([
      'openai/model-a',
      'openai/model-b',
      'openai/model-c',
    ]);
    expect(snapshot.offerings.find((o) => o.offering_id === 'vercel/model-a')?.is_cheapest).toBe(
      undefined,
    );
  });

  it('maps every offering to a canonical model', () => {
    const snapshot = buildV2Snapshot(hydratedEngine(benchmarks, pricing));
    for (const offering of snapshot.offerings) {
      expect(snapshot.canonicals.some((c) => c.model_id === offering.model_id)).toBe(true);
    }
  });

  it('ranks by quality and flags the Pareto frontier', () => {
    const snapshot = buildV2Snapshot(hydratedEngine(benchmarks, pricing));
    const results = bestModels(snapshot, { limit: 10 });

    expect(results.map((r) => r.canonical.model_id)).toEqual(['model-a', 'model-b', 'model-c']);

    // model-a: top quality at medium cost — pareto. model-b: cheaper with
    // lower quality — pareto. model-c: worse AND pricier than model-a.
    const byId = new Map(results.map((r) => [r.canonical.model_id, r.pareto_optimal]));
    expect(byId.get('model-a')).toBe(true);
    expect(byId.get('model-b')).toBe(true);
    expect(byId.get('model-c')).toBe(false);
  });

  it('filters by budget using the cheapest offering', () => {
    const snapshot = buildV2Snapshot(hydratedEngine(benchmarks, pricing));
    const results = bestModels(snapshot, { maxCost: 1.5 });
    expect(results.map((r) => r.canonical.model_id)).toEqual(['model-b']);
    expect(results[0]?.offering?.offering_id).toBe('openai/model-b');
  });

  it('filters by benchmark category', () => {
    const snapshot = buildV2Snapshot(hydratedEngine(benchmarks, pricing));
    const results = bestModels(snapshot, { category: 'coding' });
    expect(results.map((r) => r.canonical.model_id)).toEqual(['model-b']);
  });
});
