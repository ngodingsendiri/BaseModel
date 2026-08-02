import { describe, expect, it } from 'vitest';
import {
  ApiSchema,
  BenchmarkSchema,
  CapabilitySchema,
  LicenseSchema,
  ModelSchema,
  PricingSchema,
  ProviderSchema,
} from '../index';
import { HttpUrlSchema } from '../url';

describe('Schema exports', () => {
  it('exports ProviderSchema', () => {
    expect(ProviderSchema).toBeDefined();
  });

  it('exports ModelSchema', () => {
    expect(ModelSchema).toBeDefined();
  });

  it('exports CapabilitySchema', () => {
    expect(CapabilitySchema).toBeDefined();
  });

  it('exports BenchmarkSchema', () => {
    expect(BenchmarkSchema).toBeDefined();
  });

  it('exports PricingSchema', () => {
    expect(PricingSchema).toBeDefined();
  });

  it('exports ApiSchema', () => {
    expect(ApiSchema).toBeDefined();
  });

  it('exports LicenseSchema', () => {
    expect(LicenseSchema).toBeDefined();
  });
});

describe('ProviderSchema', () => {
  it('parses a valid provider', () => {
    const result = ProviderSchema.safeParse({
      provider_id: 'openai',
      name: 'OpenAI',
      organization: 'OpenAI LP',
      website: 'https://openai.com',
      provider_type: 'first-party',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a provider without a website (never fabricated)', () => {
    const result = ProviderSchema.safeParse({
      provider_id: 'unknown-gw',
      name: 'Unknown GW',
      organization: 'Unknown GW',
      provider_type: 'gateway',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a provider with an updated_at timestamp', () => {
    const result = ProviderSchema.safeParse({
      provider_id: 'openai',
      name: 'OpenAI',
      organization: 'OpenAI LP',
      website: 'https://openai.com',
      provider_type: 'first-party',
      status: 'active',
      updated_at: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid provider_id (spaces)', () => {
    const result = ProviderSchema.safeParse({
      provider_id: 'open ai',
      name: 'OpenAI',
      organization: 'OpenAI LP',
      website: 'https://openai.com',
      status: 'active',
    });
    expect(result.success).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/model.json'])(
    'rejects non-web URL scheme: %s',
    (website) => {
      const result = ProviderSchema.safeParse({
        provider_id: 'openai',
        name: 'OpenAI',
        organization: 'OpenAI LP',
        website,
        provider_type: 'first-party',
        status: 'active',
      });
      expect(result.success).toBe(false);
    },
  );

  it('accepts HTTP and HTTPS URLs', () => {
    expect(HttpUrlSchema.safeParse('http://example.com').success).toBe(true);
    expect(HttpUrlSchema.safeParse('https://example.com/docs').success).toBe(true);
  });
});

describe('ModelSchema', () => {
  const validModel = {
    model_id: 'openai/gpt-4o',
    provider_id: 'openai',
    name: 'GPT-4o',
    context_window: 128000,
    modality: ['text', 'image'],
    open_weight: false,
    reasoning_support: false,
    function_calling: true,
    structured_output: true,
    vision_support: true,
    audio_support: false,
    image_generation: false,
    embedding_support: false,
    status: 'active',
  };

  it('parses a valid model', () => {
    const result = ModelSchema.safeParse(validModel);
    expect(result.success).toBe(true);
  });

  it('rejects a model_id without provider prefix', () => {
    const result = ModelSchema.safeParse({ ...validModel, model_id: 'gpt-4o' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = ModelSchema.safeParse({ ...validModel, status: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative context_window', () => {
    const result = ModelSchema.safeParse({ ...validModel, context_window: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts a model with an updated_at timestamp', () => {
    const result = ModelSchema.safeParse({
      ...validModel,
      updated_at: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('PricingSchema', () => {
  const validPricing = {
    pricing_id: 'openai-gpt-4o-input',
    model_id: 'openai/gpt-4o',
    pricing_type: 'input-token',
    currency: 'USD',
    unit: '1M tokens',
    value: 5,
  };

  it('parses a valid pricing record', () => {
    expect(PricingSchema.safeParse(validPricing).success).toBe(true);
  });

  it('accepts source provenance and updated_at', () => {
    const result = PricingSchema.safeParse({
      ...validPricing,
      source: 'openrouter',
      updated_at: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
