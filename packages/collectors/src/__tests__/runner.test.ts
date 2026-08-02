import { join } from 'node:path';
import { ModelSchema } from '@basemodel/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeGatewayPlugin,
  executeGatewayPlugin,
  normalizeModelId,
  toModelSlug,
} from '../core/runner';

const MODEL_SLUG_REGEX = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const GROQ_PATH = join(__dirname, '..', 'gateways', 'groq.ts');

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

describe('runSimpleGateway resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GROQ_API_KEY;
  });

  it('accepts a bare top-level model array (Together-style response)', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', context_length: 131072 },
        ],
      }),
    );
    const plugin = await describeGatewayPlugin(GROQ_PATH);
    const result = await executeGatewayPlugin(GROQ_PATH, plugin);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]?.model_id).toBe('groq/llama-3.3-70b-instruct-turbo');
    expect(result.errors).toEqual([]);
  });

  it('accepts the OpenAI-style { data: [...] } wrapper', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'groq/llama-3.3-70b-versatile' }] }),
      }),
    );
    const plugin = await describeGatewayPlugin(GROQ_PATH);
    const result = await executeGatewayPlugin(GROQ_PATH, plugin);
    expect(result.models).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('retries transient statuses (429) and succeeds on a later attempt', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'groq/llama-3.3-70b-versatile' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const plugin = await describeGatewayPlugin(GROQ_PATH);
    const result = await executeGatewayPlugin(GROQ_PATH, plugin);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.models).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('gives each retry attempt a fresh timeout signal', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const signals: Array<AbortSignal> = [];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      if (signals.length === 1) {
        return { ok: false, status: 429, statusText: 'Too Many Requests' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'groq/llama-3.3-70b-versatile' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const plugin = await describeGatewayPlugin(GROQ_PATH);
    const result = await executeGatewayPlugin(GROQ_PATH, plugin);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]?.aborted).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('reports actionable hints for non-retryable HTTP failures', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    );
    const plugin = await describeGatewayPlugin(GROQ_PATH);
    const result = await executeGatewayPlugin(GROQ_PATH, plugin);
    expect(result.models).toEqual([]);
    expect(result.errors.join(' ')).toMatch(/Unauthorized/);
    expect(result.errors.join(' ')).toMatch(/check that the API key/);
  });
});
