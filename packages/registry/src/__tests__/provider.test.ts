import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderSchema } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import { validate } from '../validation';

// Resolve data/registry path relative to workspace root (4 levels up from __tests__)
const registryRoot = join(__dirname, '..', '..', '..', '..', 'data', 'registry');

function loadProvider(id: string) {
  const raw = readFileSync(join(registryRoot, 'providers', `${id}.json`), 'utf-8');
  return JSON.parse(raw) as unknown;
}

const providerIds = ['openai', 'anthropic', 'google', 'meta', 'mistral-ai'];

describe('Provider seed data validation', () => {
  it.each(providerIds)('%s passes ProviderSchema validation', (id) => {
    const data = loadProvider(id);
    const result = validate(ProviderSchema, data);
    if (!result.success) {
      console.error(`Validation errors for ${id}:`, result.errors);
    }
    expect(result.success).toBe(true);
  });

  it('rejects a provider with an invalid provider_id format', () => {
    const result = validate(ProviderSchema, {
      provider_id: 'Open AI', // spaces not allowed
      name: 'OpenAI',
      organization: 'OpenAI LP',
      website: 'https://openai.com',
      provider_type: 'first-party',
      status: 'active',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a provider with an invalid website URL', () => {
    const result = validate(ProviderSchema, {
      provider_id: 'openai',
      name: 'OpenAI',
      organization: 'OpenAI LP',
      website: 'not-a-url',
      provider_type: 'first-party',
      status: 'active',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a provider with an invalid status', () => {
    const result = validate(ProviderSchema, {
      provider_id: 'openai',
      name: 'OpenAI',
      organization: 'OpenAI LP',
      website: 'https://openai.com',
      provider_type: 'first-party',
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});
