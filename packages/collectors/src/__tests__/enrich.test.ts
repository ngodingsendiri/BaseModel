import type { Model } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import type { PricingSourceSpec } from '../core/collector';
import { classifyTier } from '../enrich/classify';
import { findOpenRouterMatch, physicalSlug, propagateTiers } from '../enrich/index';
import {
  findHuggingFaceMatch,
  type HuggingFaceModel,
  indexHuggingFace,
} from '../enrich/sources/huggingface';
import type { OpenRouterModel } from '../enrich/sources/openrouter';
import { perTokenToPer1M } from '../enrich/sources/openrouter';
import {
  findPricingMatch,
  indexPricingCatalog,
  parsePricingEntry,
} from '../enrich/sources/provider';

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

function sampleOpenRouter(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return {
    id: 'openai/gpt-4o',
    slug: 'gpt-4o',
    provider: 'openai',
    contextLength: 128000,
    inputPer1M: 2.5,
    outputPer1M: 10,
    isFree: false,
    ...overrides,
  };
}

describe('classifyTier', () => {
  it('classifies a fully free model', () => {
    expect(classifyTier(0, 0)).toEqual({ tier: 'free', isFree: true });
  });

  it('classifies a budget model', () => {
    const result = classifyTier(0.1, 0.2);
    expect(result.tier).toBe('budget');
    expect(result.isFree).toBe(false);
  });

  it('classifies a balanced model', () => {
    expect(classifyTier(2.5, 10).tier).toBe('balanced');
  });

  it('classifies a premium model', () => {
    expect(classifyTier(10, 30).tier).toBe('premium');
  });
});

describe('perTokenToPer1M', () => {
  it('converts OpenRouter USD-per-token strings to per-1M', () => {
    expect(perTokenToPer1M('0.0000025')).toBe(2.5);
    expect(perTokenToPer1M('0.00001')).toBe(10);
    expect(perTokenToPer1M('0')).toBe(0);
  });

  it('handles missing values', () => {
    expect(perTokenToPer1M(undefined)).toBeUndefined();
    expect(perTokenToPer1M('')).toBeUndefined();
    expect(perTokenToPer1M('not-a-number')).toBeUndefined();
  });
});

describe('findOpenRouterMatch', () => {
  it('matches an exact provider/slug id', () => {
    const entry = sampleOpenRouter();
    const index = {
      byId: new Map([['openai/gpt-4o', entry]]),
      bySlug: new Map([['gpt-4o', [entry]]]),
    };
    expect(findOpenRouterMatch(sampleModel(), index)).toBe(entry);
  });

  it('matches a tilde community variant id', () => {
    const entry = sampleOpenRouter({ id: '~openai/gpt-4o', provider: '~openai' });
    const index = {
      byId: new Map([['~openai/gpt-4o', entry]]),
      bySlug: new Map([['gpt-4o', [entry]]]),
    };
    expect(findOpenRouterMatch(sampleModel(), index)).toBe(entry);
  });

  it('falls back to slug match when the provider differs', () => {
    const entry = sampleOpenRouter({ id: 'openai/gpt-4o', provider: 'openai' });
    const model = sampleModel({ provider_id: 'openrouter', model_id: 'openrouter/gpt-4o' });
    const index = {
      byId: new Map(),
      bySlug: new Map([['gpt-4o', [entry]]]),
    };
    expect(findOpenRouterMatch(model, index)).toBe(entry);
  });

  it('prefers a same-provider slug match over a first-party one', () => {
    const other = sampleOpenRouter({
      id: 'openai/gpt-4o',
      provider: 'openai',
      inputPer1M: 2.5,
    });
    const same = sampleOpenRouter({
      id: 'deepseek/gpt-4o',
      provider: 'deepseek',
      inputPer1M: 1,
    });
    const model = sampleModel({ provider_id: 'deepseek', model_id: 'deepseek/gpt-4o' });
    const index = {
      byId: new Map(),
      bySlug: new Map([['gpt-4o', [other, same]]]),
    };
    expect(findOpenRouterMatch(model, index)).toBe(same);
  });

  it('returns undefined when nothing matches', () => {
    const index = { byId: new Map(), bySlug: new Map() };
    expect(findOpenRouterMatch(sampleModel(), index)).toBeUndefined();
  });

  it('matches a catalog `:free` route to the collected `-free` model id', () => {
    const entry = sampleOpenRouter({
      id: 'nvidia/nemotron-3-nano-30b-a3b:free',
      provider: 'nvidia',
      slug: 'nemotron-3-nano-30b-a3b-free',
      inputPer1M: 0,
      outputPer1M: 0,
      isFree: true,
    });
    const model = sampleModel({
      provider_id: 'openrouter',
      model_id: 'openrouter/nemotron-3-nano-30b-a3b-free',
    });
    const index = {
      byId: new Map([['nvidia/nemotron-3-nano-30b-a3b:free', entry]]),
      bySlug: new Map([['nemotron-3-nano-30b-a3b-free', [entry]]]),
    };
    expect(findOpenRouterMatch(model, index)).toBe(entry);
  });

  it('matches a regional variant to its base model slug', () => {
    const entry = sampleOpenRouter({
      id: 'anthropic/claude-fable-5',
      provider: 'anthropic',
      slug: 'claude-fable-5',
      inputPer1M: 10,
      outputPer1M: 50,
    });
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/claude-fable-5-eu',
      name: 'claude-fable-5-eu',
    });
    const index = {
      byId: new Map(),
      bySlug: new Map([['claude-fable-5', [entry]]]),
    };
    expect(findOpenRouterMatch(model, index)).toBe(entry);
  });

  it('does not region-strip when a slug match already exists', () => {
    const base = sampleOpenRouter({
      id: 'anthropic/claude-fable-5',
      provider: 'anthropic',
      slug: 'claude-fable-5',
      inputPer1M: 10,
      outputPer1M: 50,
    });
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/claude-fable-5-eu',
      name: 'claude-fable-5-eu',
    });
    const index = {
      byId: new Map(),
      bySlug: new Map([['claude-fable-5-eu', [base]]]),
    };
    expect(findOpenRouterMatch(model, index)).toBe(base);
  });

  it('returns undefined when region-stripped slug also has no match', () => {
    const index = { byId: new Map(), bySlug: new Map() };
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/some-model-eu',
      name: 'some-model-eu',
    });
    expect(findOpenRouterMatch(model, index)).toBeUndefined();
  });

  it('resolves paid and `:free` variants of the same model to distinct entries', () => {
    const paid = sampleOpenRouter({
      id: 'nvidia/nemotron-3-nano-30b-a3b',
      provider: 'nvidia',
      slug: 'nemotron-3-nano-30b-a3b',
      inputPer1M: 0.05,
      outputPer1M: 0.2,
      isFree: false,
    });
    const free = sampleOpenRouter({
      id: 'nvidia/nemotron-3-nano-30b-a3b:free',
      provider: 'nvidia',
      slug: 'nemotron-3-nano-30b-a3b-free',
      inputPer1M: 0,
      outputPer1M: 0,
      isFree: true,
    });
    const index = {
      byId: new Map([
        ['nvidia/nemotron-3-nano-30b-a3b', paid],
        ['nvidia/nemotron-3-nano-30b-a3b:free', free],
      ]),
      bySlug: new Map([
        ['nemotron-3-nano-30b-a3b', [paid]],
        ['nemotron-3-nano-30b-a3b-free', [free]],
      ]),
    };
    expect(
      findOpenRouterMatch(
        sampleModel({
          provider_id: 'openrouter',
          model_id: 'openrouter/nemotron-3-nano-30b-a3b',
        }),
        index,
      ),
    ).toBe(paid);
    expect(
      findOpenRouterMatch(
        sampleModel({
          provider_id: 'openrouter',
          model_id: 'openrouter/nemotron-3-nano-30b-a3b-free',
        }),
        index,
      ),
    ).toBe(free);
  });
});

function sampleHuggingFace(overrides: Partial<HuggingFaceModel> = {}): HuggingFaceModel {
  return {
    id: 'deepseek-ai/DeepSeek-V4-Flash',
    slug: 'deepseek-v4-flash',
    providers: [
      {
        name: 'deepinfra',
        contextLength: 1048576,
        inputPer1M: 0.14,
        outputPer1M: 0.28,
        isFree: false,
      },
    ],
    ...overrides,
  };
}

describe('huggingface source', () => {
  it('normalizes HF ids into dash-separated slugs', () => {
    expect(indexHuggingFace([])).toEqual(new Map());
  });

  it('matches a registry model to its HF provider backend', () => {
    const entry = sampleHuggingFace();
    const index = indexHuggingFace([entry]);
    const model = sampleModel({
      provider_id: 'deepinfra',
      model_id: 'deepinfra/deepseek-v4-flash',
    });
    expect(findHuggingFaceMatch(model, index)).toMatchObject({
      provider: 'deepinfra',
      inputPer1M: 0.14,
      outputPer1M: 0.28,
    });
  });

  it('collapses dot/dash slug variants for HF matching', () => {
    const entry = sampleHuggingFace({ id: 'mistralai/Mixtral-8x7B' });
    const index = indexHuggingFace([entry]);
    expect(
      findHuggingFaceMatch(
        sampleModel({ provider_id: 'mistral-ai', model_id: 'mistral-ai/mixtral-8x7b' }),
        index,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the provider does not serve the model', () => {
    const index = indexHuggingFace([sampleHuggingFace()]);
    expect(
      findHuggingFaceMatch(
        sampleModel({ provider_id: 'groq', model_id: 'groq/deepseek-v4-flash' }),
        index,
      ),
    ).toBeUndefined();
  });

  it('does not match a backend that serves the model without pricing', () => {
    const entry = sampleHuggingFace({
      providers: [{ name: 'deepinfra', isFree: false }],
    });
    const index = indexHuggingFace([entry]);
    expect(
      findHuggingFaceMatch(
        sampleModel({ provider_id: 'deepinfra', model_id: 'deepinfra/deepseek-v4-flash' }),
        index,
      ),
    ).toBeUndefined();
  });
});

describe('provider pricing source', () => {
  const requestySpec: PricingSourceSpec = {
    url: 'https://router.requesty.ai/v1/models',
    auth: 'none',
  };

  function samplePricing(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
    return {
      id: 'bedrock/claude-haiku-4-5@ap-northeast-1',
      slug: 'claude-haiku-4-5-ap-northeast-1',
      provider: 'provider-catalog',
      contextLength: 200000,
      inputPer1M: 0.5,
      outputPer1M: 3,
      isFree: false,
      ...overrides,
    };
  }

  it('parses Requesty-style per-token numeric prices into per-1M', () => {
    const entry = parsePricingEntry(
      {
        id: 'bedrock/claude-haiku-4-5@ap-northeast-1',
        input_price: 0.0000005,
        output_price: 0.000003,
        context_window: 200000,
      },
      requestySpec,
    );
    expect(entry).toMatchObject({
      id: 'bedrock/claude-haiku-4-5@ap-northeast-1',
      slug: 'claude-haiku-4-5-ap-northeast-1',
      inputPer1M: 0.5,
      outputPer1M: 3,
      contextLength: 200000,
      isFree: false,
    });
  });

  it('never marks a model free when a price is missing', () => {
    const entry = parsePricingEntry({ id: 'acme/gpt-9', input_price: 0.5 }, requestySpec);
    expect(entry.isFree).toBe(false);
    expect(entry.outputPer1M).toBeUndefined();
  });

  it('marks explicitly zero-priced models as free', () => {
    const entry = parsePricingEntry(
      { id: 'poolside/laguna-m.1', input_price: 0, output_price: 0 },
      requestySpec,
    );
    expect(entry.isFree).toBe(true);
  });

  it('parses string prices and respects the per-1m unit', () => {
    const entry = parsePricingEntry(
      { id: 'acme/gpt-9', input_price: '0.5', output_price: '1.5' },
      { ...requestySpec, pricingUnit: 'per-1m' },
    );
    expect(entry.inputPer1M).toBe(0.5);
    expect(entry.outputPer1M).toBe(1.5);
  });

  it('reads nested and remapped fields via dot-paths', () => {
    const entry = parsePricingEntry(
      {
        model: 'acme/gpt-9',
        pricing: { prompt: '0.0000025', completion: '0.00001' },
        context: 128000,
      },
      {
        idField: 'model',
        inputPriceField: 'pricing.prompt',
        outputPriceField: 'pricing.completion',
        contextField: 'context',
      },
    );
    expect(entry).toMatchObject({
      slug: 'gpt-9',
      inputPer1M: 2.5,
      outputPer1M: 10,
      contextLength: 128000,
    });
  });

  it('indexes catalog entries by slug', () => {
    const index = indexPricingCatalog([samplePricing()]);
    expect(index.get('claude-haiku-4-5-ap-northeast-1')).toHaveLength(1);
    expect(index.get('missing')).toBeUndefined();
  });

  it('matches an exact slug including the region suffix', () => {
    const entry = samplePricing();
    const index = indexPricingCatalog([entry]);
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/claude-haiku-4-5-ap-northeast-1',
      name: 'claude-haiku-4-5-ap-northeast-1',
    });
    expect(findPricingMatch(model, index)).toBe(entry);
  });

  it('falls back to the region-stripped slug', () => {
    const base = samplePricing({ id: 'vertex/claude-haiku-4-5', slug: 'claude-haiku-4-5' });
    const index = indexPricingCatalog([base]);
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/claude-haiku-4-5-eu',
      name: 'claude-haiku-4-5-eu',
    });
    expect(findPricingMatch(model, index)).toBe(base);
  });

  it('does not region-strip when an exact slug match exists', () => {
    const exact = samplePricing({ slug: 'claude-haiku-4-5-eu' });
    const base = samplePricing({ slug: 'claude-haiku-4-5' });
    const index = indexPricingCatalog([exact, base]);
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/claude-haiku-4-5-eu',
      name: 'claude-haiku-4-5-eu',
    });
    expect(findPricingMatch(model, index)).toBe(exact);
  });

  it('returns undefined when no slug matches', () => {
    expect(findPricingMatch(sampleModel(), indexPricingCatalog([]))).toBeUndefined();
  });

  it('collapses dot/dash slug variants like the collectors', () => {
    const entry = samplePricing({ id: 'novita/baichuan/baichuan-m2-32b', slug: 'baichuan-m2-32b' });
    const index = indexPricingCatalog([entry]);
    const model = sampleModel({
      provider_id: 'requesty',
      model_id: 'requesty/baichuan-m2-32b',
      name: 'baichuan-m2-32b',
    });
    expect(findPricingMatch(model, index)).toBe(entry);
  });
});

describe('tier propagation', () => {
  it('propagates tier from a first-party model to a router alias', () => {
    const priced = sampleModel({
      model_id: 'openai/gpt-5.2',
      provider_id: 'openai',
      tier: 'premium' as const,
    });
    const alias = sampleModel({
      model_id: 'requesty/gpt-5.2',
      provider_id: 'requesty',
    });
    const results = propagateTiers([priced, alias]);
    expect(results).toHaveLength(1);
    const result = results[0];
    if (result) {
      expect(result.model.model_id).toBe('requesty/gpt-5.2');
      expect(result.source).toBe(priced);
    }
  });

  it('does not propagate tier to non-router providers', () => {
    const priced = sampleModel({
      model_id: 'openai/gpt-5.2',
      provider_id: 'openai',
      tier: 'premium' as const,
    });
    const other = sampleModel({ model_id: 'openai/gpt-5.2-clone', provider_id: 'openai' });
    expect(propagateTiers([priced, other])).toHaveLength(0);
  });

  it('prefers the first-party source over another router alias', () => {
    const priced = sampleModel({
      model_id: 'openai/gpt-5.2',
      provider_id: 'openai',
      tier: 'premium' as const,
    });
    const vercel = sampleModel({ model_id: 'vercel/gpt-5.2', provider_id: 'vercel' });
    const requesty = sampleModel({ model_id: 'requesty/gpt-5.2', provider_id: 'requesty' });
    const results = propagateTiers([priced, vercel, requesty]);
    expect(results.find((r) => r.model.model_id === 'requesty/gpt-5.2')?.source).toBe(priced);
    expect(results.find((r) => r.model.model_id === 'vercel/gpt-5.2')?.source).toBe(priced);
  });

  it('canonicalizes physical slugs across dot/dash and region suffixes', () => {
    expect(physicalSlug('requesty/claude-haiku-4.5-ap-northeast-1')).toBe('claude-haiku-4-5');
    expect(physicalSlug('vercel/claude-haiku-4-5')).toBe('claude-haiku-4-5');
  });
});
