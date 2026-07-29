import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicCollector } from '../providers/anthropic';

// Mock the global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('AnthropicCollector', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const collector = new AnthropicCollector();
    const result = await collector.fetchModels();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('ANTHROPIC_API_KEY is required');
  });

  it('parses valid API responses and normalizes them', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            type: 'model',
            id: 'claude-3-5-sonnet-20241022',
            display_name: 'Claude 3.5 Sonnet',
            created_at: '2024-10-22T00:00:00Z',
          },
        ],
        has_more: false,
      }),
    });

    const collector = new AnthropicCollector();
    const result = await collector.fetchModels();

    expect(result.provider_id).toBe('anthropic');
    expect(result.errors).toHaveLength(0);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toMatchObject({
      model_id: 'anthropic/claude-3-5-sonnet-20241022',
      provider_id: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      release_date: '2024-10-22',
      status: 'active',
    });
  });
});
