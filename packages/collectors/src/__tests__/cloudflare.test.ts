import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cloudflareGateway from '../gateways/cloudflare';

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('cloudflare gateway', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it('fails if account id or api token is missing', async () => {
    const result = await cloudflareGateway.collect({});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  it('parses Workers AI catalog and normalizes ids', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [
          {
            id: '@cf/meta/llama-3.1-8b-instruct',
            name: 'Meta Llama 3.1 8B Instruct',
            description: 'Open-weight instruct model',
            task: { id: 'text-generation', name: 'Text Generation' },
          },
          {
            id: '@cf/huggingface/distilbert-sst-2-int8',
            name: 'DistilBERT SST-2',
            task: { id: 'text-classification', name: 'Text Classification' },
          },
        ],
        result_info: { page: 1, per_page: 100, count: 2, total_count: 2 },
      }),
    });

    const result = await cloudflareGateway.collect({
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      CLOUDFLARE_API_TOKEN: 'token',
    });
    expect(result.errors).toHaveLength(0);
    expect(result.models).toHaveLength(2);
    expect(result.models[0]).toMatchObject({
      model_id: 'cloudflare/llama-3.1-8b-instruct',
      provider_id: 'cloudflare',
      name: 'Meta Llama 3.1 8B Instruct',
      open_weight: true,
    });
  });

  it('paginates until the full catalog is fetched', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [{ id: '@cf/meta/llama-3.1-8b-instruct', task: { id: 'text-generation' } }],
        result_info: { page: 1, per_page: 1, count: 1, total_count: 2 },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [{ id: '@cf/qwen/qwen2.5-coder-32b-instruct', task: { id: 'text-generation' } }],
        result_info: { page: 2, per_page: 1, count: 1, total_count: 2 },
      }),
    });

    const result = await cloudflareGateway.collect({
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      CLOUDFLARE_API_TOKEN: 'token',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.models).toHaveLength(2);
    expect(result.models[1]?.model_id).toBe('cloudflare/qwen2.5-coder-32b-instruct');
  });

  it('reports API failure responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, result: [], errors: ['bad token'] }),
    });

    const result = await cloudflareGateway.collect({
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      CLOUDFLARE_API_TOKEN: 'bad',
    });
    expect(result.errors).toHaveLength(1);
  });

  it('explains a 404 from the Workers AI catalog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await cloudflareGateway.collect({
      CLOUDFLARE_ACCOUNT_ID: 'wrong-account',
      CLOUDFLARE_API_TOKEN: 'token',
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(result.errors[0]).toContain('Workers AI');
  });
});
