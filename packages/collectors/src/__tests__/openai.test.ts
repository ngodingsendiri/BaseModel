import { describe, expect, it, vi } from 'vitest';
import { OpenAICollector } from '../providers/openai';

// Mock the global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('OpenAICollector', () => {
  it('parses valid API responses and normalizes them', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        object: 'list',
        data: [
          {
            id: 'gpt-4o',
            object: 'model',
            created: 1715367049,
            owned_by: 'system',
          },
        ],
      }),
    });

    const collector = new OpenAICollector();
    const result = await collector.fetchModels();

    expect(result.provider_id).toBe('openai');
    expect(result.errors).toHaveLength(0);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toMatchObject({
      model_id: 'openai/gpt-4o',
      provider_id: 'openai',
      name: 'gpt-4o',
      status: 'active',
    });
  });

  it('records an error on failed fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const collector = new OpenAICollector();
    const result = await collector.fetchModels();

    expect(result.models).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('401');
  });

  it('records an error on invalid JSON schema', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        // Missing the 'data' array
        object: 'list',
      }),
    });

    const collector = new OpenAICollector();
    const result = await collector.fetchModels();

    expect(result.models).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Failed to parse OpenAI response');
  });
});
