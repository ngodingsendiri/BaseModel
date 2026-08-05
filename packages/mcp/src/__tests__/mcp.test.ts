import { IntelligenceEngine } from '@basemodel/intelligence';
import type { Model } from '@basemodel/schema';
import { describe, expect, it } from 'vitest';
import type { McpServerDeps } from '../handler';
import { handleMcpRequest } from '../handler';

function makeModel(overrides: Partial<Model> & Pick<Model, 'model_id'>): Model {
  const providerId = overrides.provider_id ?? overrides.model_id.split('/')[0] ?? 'openai';
  const base: Model = {
    model_id: overrides.model_id,
    provider_id: providerId,
    name: overrides.model_id.split('/').pop() ?? overrides.model_id,
    status: 'active',
    open_weight: false,
    function_calling: false,
    structured_output: false,
    modality: ['text'],
    capability_ids: [],
    reasoning_support: false,
    vision_support: false,
    audio_support: false,
    image_generation: false,
    embedding_support: false,
  };
  return { ...base, ...overrides };
}

const engine = new IntelligenceEngine();
engine.hydrate({
  models: [
    makeModel({ model_id: 'openai/gpt-4o', context_window: 128000 }),
    makeModel({ model_id: 'deepinfra/blur-background', modality: ['image'] }),
  ],
  providers: [
    {
      provider_id: 'openai',
      name: 'OpenAI',
      organization: 'OpenAI',
      website: 'https://openai.com',
      provider_type: 'first-party',
      status: 'active',
    },
    {
      provider_id: 'deepinfra',
      name: 'DeepInfra',
      organization: 'DeepInfra',
      website: 'https://deepinfra.com',
      provider_type: 'gateway',
      status: 'active',
    },
  ],
  pricing: [
    {
      pricing_id: 'openai/gpt-4o-input',
      model_id: 'openai/gpt-4o',
      pricing_type: 'input-token',
      currency: 'USD',
      unit: '1M tokens',
      value: 2.5,
      source: 'openai',
    },
  ],
  benchmarks: [
    {
      benchmark_id: 'gpt-4o-bench',
      model_id: 'gpt-4o',
      benchmark_name: 'test',
      score: 88,
      source: 'openllm',
      category: ['general'],
    },
  ],
});

const deps: McpServerDeps = { getEngine: async () => engine };

interface ToolCallResponse {
  result?: {
    tools?: Array<{ name: string }>;
    content?: Array<{ text: string }>;
  };
  error?: { code: number };
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = (await handleMcpRequest(deps, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  })) as ToolCallResponse;
  const text = response.result?.content?.[0]?.text ?? '';
  let payload: Record<string, unknown> | undefined;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    // Plain-text tool errors (e.g. "Model not found") are not JSON.
  }
  return { response, payload };
}

describe('MCP protocol', () => {
  it('responds to initialize with server info', async () => {
    const response = (await handleMcpRequest(deps, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    })) as ToolCallResponse & { result?: { serverInfo?: { name: string } } };
    expect(response.result?.serverInfo?.name).toBe('basemodel-mcp');
  });

  it('lists the four intelligence tools', async () => {
    const response = (await handleMcpRequest(deps, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })) as ToolCallResponse;
    const names = response.result?.tools?.map((tool) => tool.name);
    expect(names).toEqual(['search_models', 'model_info', 'alternatives', 'best_models']);
  });

  it('returns null for notifications (no reply expected)', async () => {
    const response = await handleMcpRequest(deps, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(response).toBeNull();
  });

  it('returns method-not-found for unknown methods', async () => {
    const response = (await handleMcpRequest(deps, {
      jsonrpc: '2.0',
      id: 3,
      method: 'bogus/method',
    })) as ToolCallResponse;
    expect(response.error?.code).toBe(-32601);
  });
});

describe('MCP tools', () => {
  it('search_models filters by provider', async () => {
    const { payload } = await callTool('search_models', { provider: 'deepinfra' });
    const data = payload as unknown as { count: number; models: Array<{ model_id: string }> };
    expect(data.count).toBe(1);
    expect(data.models[0]?.model_id).toBe('deepinfra/blur-background');
  });

  it('model_info returns details plus cost', async () => {
    const { payload } = await callTool('model_info', { model_id: 'openai/gpt-4o' });
    const data = payload as unknown as { model_id: string; cost: { inputCostPer1M: number } };
    expect(data.model_id).toBe('openai/gpt-4o');
    expect(data.cost.inputCostPer1M).toBeGreaterThan(0);
  });

  it('model_info reports missing models as tool errors', async () => {
    const { response } = await callTool('model_info', { model_id: 'nope/nope' });
    expect(response.result?.content?.[0]?.text).toContain('Model not found');
  });

  it('best_models returns quality-ranked canonical models', async () => {
    const { payload } = await callTool('best_models', {});
    const data = payload as unknown as {
      count: number;
      results: Array<{
        model_id: string;
        quality_score: number;
        cheapest_offering: string;
      }>;
    };
    expect(data.count).toBe(1);
    expect(data.results[0]?.model_id).toBe('gpt-4o');
    expect(data.results[0]?.quality_score).toBe(88);
    expect(data.results[0]?.cheapest_offering).toBe('openai/gpt-4o');
  });
});
