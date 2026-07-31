import { ModelSchema } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import { normalizeModelId, toModelSlug } from '../core/runner';

const MODEL_SLUG_REGEX = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

describe('toModelSlug', () => {
  it.each([
    ['gpt-4o', 'gpt-4o'],
    ['sesame/csm-1b', 'csm-1b'],
    ['Qwen/Qwen3-Coder-480B-A35B-Instruct', 'qwen3-coder-480b-a35b-instruct'],
    ['anthropic/claude-opus-5-fast', 'claude-opus-5-fast'],
    ['inclusionai/ling-3.0-flash:free', 'ling-3.0-flash-free'],
    ['groq/compound-mini', 'compound-mini'],
    ['openai/gpt-5.6-luna-pro', 'gpt-5.6-luna-pro'],
    ['meta/muse-spark-1.1', 'muse-spark-1.1'],
  ])('normalizes %s into a schema-valid slug', (raw, expected) => {
    expect(toModelSlug(raw)).toBe(expected);
    expect(expected).toMatch(MODEL_SLUG_REGEX);
  });

  it('falls back to "model" when no usable characters remain', () => {
    expect(toModelSlug('///:')).toBe('model');
  });

  it('produces model_ids accepted by the ModelSchema', () => {
    for (const raw of [
      'deepinfra/sesame/csm-1b',
      'openrouter/qwen/qwen3.7-flash',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/openai/gpt-5.6-luna-pro',
    ]) {
      const providerId = raw.split('/')[0];
      const modelId = `${providerId}/${toModelSlug(raw)}`;
      expect(ModelSchema.shape.model_id.safeParse(modelId).success).toBe(true);
    }
  });
});

describe('normalizeModelId', () => {
  it.each([
    ['vercel/openai/gpt-4o', 'vercel', 'vercel/gpt-4o'],
    ['portkey/anthropic/claude-opus-5-fast', 'portkey', 'portkey/claude-opus-5-fast'],
    ['openrouter/qwen/qwen3.7-flash:free', 'openrouter', 'openrouter/qwen3.7-flash-free'],
  ])('re-keys %s against provider %s', (raw, providerId, expected) => {
    expect(normalizeModelId(raw, providerId)).toBe(expected);
  });

  it('is idempotent for already-valid ids', () => {
    expect(normalizeModelId('anthropic/claude-3-5-sonnet-20241022', 'anthropic')).toBe(
      'anthropic/claude-3-5-sonnet-20241022',
    );
    expect(normalizeModelId('openai/gpt-4o', 'openai')).toBe('openai/gpt-4o');
  });
});
