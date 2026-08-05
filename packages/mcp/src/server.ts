#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { IntelligenceEngine } from '@basemodel/intelligence';
import type { McpRequest, McpServerDeps } from './handler.js';
import { handleMcpRequest } from './handler.js';

/**
 * Stdio transport for the BaseModel MCP server.
 * Speaks newline-delimited JSON-RPC 2.0 over stdin/stdout, as required by
 * the Model Context Protocol.
 *
 * Client configuration example:
 *   { "mcpServers": { "basemodel": { "command": "node", "args": ["packages/mcp/dist/server.js"] } } }
 */

let enginePromise: Promise<IntelligenceEngine> | undefined;

const deps: McpServerDeps = {
  getEngine(): Promise<IntelligenceEngine> {
    if (!enginePromise) {
      enginePromise = (async () => {
        const engine = new IntelligenceEngine();
        await engine.init();
        return engine;
      })().catch((error: unknown) => {
        enginePromise = undefined;
        throw error;
      });
    }
    return enginePromise;
  },
};

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: McpRequest;
    try {
      message = JSON.parse(trimmed) as McpRequest;
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`,
      );
      return;
    }

    void handleMcpRequest(deps, message)
      .then((response) => {
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      })
      .catch((error: unknown) => {
        const response = {
          jsonrpc: '2.0',
          id: message.id ?? null,
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
      });
  });

  rl.on('close', () => process.exit(0));
}

main().catch((error: unknown) => {
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
