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
});
