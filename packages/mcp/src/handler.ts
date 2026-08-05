import type { IntelligenceEngine } from '@basemodel/intelligence';
import {
  bestModels,
  buildV2Snapshot,
  calculateCostEfficiency,
  findAlternatives,
  searchModels,
} from '@basemodel/intelligence';
import type { Model } from '@basemodel/schema';

/**
 * Minimal Model Context Protocol (stdio) handler for BaseModel.
 *
 * Implemented dependency-free over JSON-RPC 2.0 (MCP protocol version
 * 2024-11-05): initialize, tools/list, tools/call. Transport concerns
 * (newline-delimited stdin/stdout) live in server.ts; everything here is a
 * pure async function so it can be unit-tested without spawning processes.
 */

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'basemodel-mcp', version: '0.1.0' };

export interface McpRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpServerDeps {
  getEngine(): Promise<IntelligenceEngine>;
}

const TOOLS = [
  {
    name: 'search_models',
    description:
      'Search the AI model catalog by provider, modality, minimum context window, or capability flags.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text match on model id/name.' },
        provider: { type: 'string', description: 'Provider id, e.g. "openai".' },
        modality: { type: 'string', description: 'Required modality, e.g. "image", "audio".' },
        min_context: { type: 'number', description: 'Minimum context window in tokens.' },
        flags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Capability flags that must be true, e.g. "open_weight", "reasoning_support".',
        },
      },
    },
  },
  {
    name: 'model_info',
    description: 'Show full details (capabilities, pricing, limits) for one model offering.',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: 'Offering id, e.g. "openai/gpt-4o".' },
      },
      required: ['model_id'],
    },
  },
  {
    name: 'alternatives',
    description: 'List alternative offerings for a model, ranked by context window and cost.',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: 'Offering id, e.g. "openai/gpt-4o".' },
        limit: { type: 'number', description: 'Maximum number of alternatives (default 5).' },
      },
      required: ['model_id'],
    },
  },
  {
    name: 'best_models',
    description:
      'Rank benchmark quality-scored models under a budget. Answers "best model for use-case X under $Y/1M tokens". Marks the Pareto frontier.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Benchmark category, e.g. "coding", "general".' },
        max_cost: { type: 'number', description: 'Maximum blended cost per 1M tokens.' },
        min_context: { type: 'number', description: 'Minimum context window in tokens.' },
        limit: { type: 'number', description: 'Maximum number of results (default 10).' },
      },
    },
  },
];

function toolResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: false };
}

function toolError(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function summarizeModel(model: Model) {
  return {
    model_id: model.model_id,
    name: model.name,
    provider_id: model.provider_id,
    status: model.status,
    modality: model.modality,
    context_window: model.context_window,
  };
}

async function callTool(deps: McpServerDeps, name: string, args: Record<string, unknown>) {
  const engine = await deps.getEngine();

  switch (name) {
    case 'search_models': {
      const results = searchModels(engine, {
        query: args.query ? String(args.query) : undefined,
        providerIds: args.provider ? [String(args.provider)] : undefined,
        modalities: args.modality ? [String(args.modality)] : undefined,
        minContextWindow: args.min_context ? Number(args.min_context) : undefined,
        flags: Array.isArray(args.flags) ? (args.flags.map(String) as (keyof Model)[]) : undefined,
      });
      return toolResult({
        count: results.length,
        models: results.slice(0, 50).map((model) => {
          const cost = calculateCostEfficiency(engine, model.model_id);
          return {
            ...summarizeModel(model),
            cost_tier: cost.tier,
            blended_cost_per_1m: cost.blendedCost,
          };
        }),
      });
    }

    case 'model_info': {
      const modelId = args.model_id;
      if (typeof modelId !== 'string' || !modelId) return toolError('model_id is required.');
      const model = engine.models.find((m) => m.model_id === modelId);
      if (!model) return toolError(`Model not found: ${modelId}`);
      const cost = calculateCostEfficiency(engine, modelId);
      return toolResult({ ...model, cost });
    }

    case 'alternatives': {
      const modelId = args.model_id;
      if (typeof modelId !== 'string' || !modelId) return toolError('model_id is required.');
      try {
        const results = findAlternatives(engine, modelId, args.limit ? Number(args.limit) : 5);
        return toolResult({
          model_id: modelId,
          alternatives: results.map((entry) => ({
            ...summarizeModel(entry.model),
            reason: entry.reason,
          })),
        });
      } catch {
        return toolError(`Model not found: ${modelId}`);
      }
    }

    case 'best_models': {
      const snapshot = buildV2Snapshot(engine);
      const results = bestModels(snapshot, {
        category: args.category ? String(args.category) : undefined,
        maxCost: args.max_cost !== undefined ? Number(args.max_cost) : undefined,
        minContextWindow: args.min_context !== undefined ? Number(args.min_context) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });
      return toolResult({
        count: results.length,
        results: results.map((entry) => ({
          model_id: entry.canonical.model_id,
          quality_score: entry.canonical.quality?.score,
          categories: entry.canonical.quality?.categories,
          pareto_optimal: entry.pareto_optimal,
          cheapest_offering: entry.offering?.offering_id,
          blended_cost_per_1m: entry.offering?.blended_cost_per_1m,
          context_window: entry.canonical.context_window,
        })),
      });
    }

    default:
      return toolError(`Unknown tool: ${name}`);
  }
}

/**
 * Handles one decoded JSON-RPC message. Returns a response object, or null
 * for notifications (which never receive a reply).
 */
export async function handleMcpRequest(
  deps: McpServerDeps,
  message: McpRequest,
): Promise<Record<string, unknown> | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: message.id ?? null, result });
  const rpcError = (code: number, errorMessage: string) => ({
    jsonrpc: '2.0',
    id: message.id ?? null,
    error: { code, message: errorMessage },
  });

  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
    case 'ping':
      return message.method === 'ping' ? reply({}) : null;

    case 'tools/list':
      return reply({ tools: TOOLS });

    case 'tools/call': {
      const toolName = message.params?.name;
      const toolArgs = (message.params?.arguments ?? {}) as Record<string, unknown>;
      if (typeof toolName !== 'string') return rpcError(-32602, 'Missing tool name.');
      try {
        return reply(await callTool(deps, toolName, toolArgs));
      } catch (error) {
        return reply(toolError(error instanceof Error ? error.message : String(error)));
      }
    }

    default:
      return message.id === undefined
        ? null
        : rpcError(-32601, `Method not found: ${message.method}`);
  }
}
