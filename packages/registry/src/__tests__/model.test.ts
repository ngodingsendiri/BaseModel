import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelSchema } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import { validate } from '../validation';

// Resolve data/registry path relative to workspace root (4 levels up from __tests__)
const registryRoot = join(__dirname, '..', '..', '..', '..', 'data', 'registry');

function loadModel(providerSlug: string, modelSlug: string) {
  const raw = readFileSync(
    join(registryRoot, 'models', providerSlug, `${modelSlug}.json`),
    'utf-8',
  );
  return JSON.parse(raw) as unknown;
}

const seedModels = [
  ['openai', 'gpt-4o'],
  ['openai', 'gpt-4o-mini'],
  ['anthropic', 'claude-3-5-sonnet'],
  ['anthropic', 'claude-3-5-haiku'],
  ['google', 'gemini-1.5-pro'],
  ['google', 'gemini-1.5-flash'],
  ['meta', 'llama-3.1-70b'],
  ['mistral-ai', 'mistral-large'],
] as const;

describe('Model seed data validation', () => {
  it.each(seedModels)('%s/%s passes ModelSchema validation', (provider, model) => {
    const data = loadModel(provider, model);
    const result = validate(ModelSchema, data);
    if (!result.success) {
      console.error(`Validation errors for ${provider}/${model}:`, result.errors);
    }
    expect(result.success).toBe(true);
  });

  it('rejects a model_id without provider prefix', () => {
    const gpt4o = loadModel('openai', 'gpt-4o') as Record<string, unknown>;
    const result = validate(ModelSchema, { ...gpt4o, model_id: 'gpt-4o' });
    expect(result.success).toBe(false);
  });

  it('rejects a model with a negative context_window', () => {
    const gpt4o = loadModel('openai', 'gpt-4o') as Record<string, unknown>;
    const result = validate(ModelSchema, { ...gpt4o, context_window: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a model with an invalid status', () => {
    const gpt4o = loadModel('openai', 'gpt-4o') as Record<string, unknown>;
    const result = validate(ModelSchema, { ...gpt4o, status: 'unknown' });
    expect(result.success).toBe(false);
  });
});
