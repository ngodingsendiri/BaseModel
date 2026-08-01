import type { Model, Pricing } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import { classifyTier } from '../enrich/classify';
import {
  indexProviderPricing,
  PROVIDER_PRICING_SOURCE,
} from '../enrich/index';
import { findOpenRouterMatch } from '../enrich/index';
import type { OpenRouterModel } from '../enrich/sources/openrouter';
import { perTokenToPer1M } from '../enrich/sources/openrouter';

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

describe('indexProviderPricing', () => {
  function record(overrides: Partial<Pricing>): Pricing {
    return {
      pricing_id: 'x',
      model_id: 'requesty/m-1',
      pricing_type: 'input-token',
      value: 2.5,
      notes: PROVIDER_PRICING_SOURCE,
      ...overrides,
    };
  }

  it('ignores non-provider records', () => {
    const map = indexProviderPricing([
      record({ notes: 'source: openrouter', model_id: 'openai/gpt-4o' }),
    ]);
    expect(map.has('openai/gpt-4o')).toBe(false);
  });

  it('aggregates input/output/free records per model', () => {
    const map = indexProviderPricing([
      record({ model_id: 'requesty/m-1', pricing_type: 'input-token', value: 2.5 }),
      record({ model_id: 'requesty/m-1', pricing_type: 'output-token', value: 10 }),
    ]);
    expect(map.get('requesty/m-1')).toEqual({ inputPer1M: 2.5, outputPer1M: 10, isFree: false });
  });

  it('marks a model free when a free record exists', () => {
    const map = indexProviderPricing([
      record({ model_id: 'requesty/free-1', pricing_type: 'free', value: 0 }),
    ]);
    expect(map.get('requesty/free-1')?.isFree).toBe(true);
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
