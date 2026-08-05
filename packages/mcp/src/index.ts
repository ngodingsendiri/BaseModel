/**
 * @basemodel/mcp
 *
 * Agent-native access to BaseModel AI model intelligence via the Model
 * Context Protocol. Exposes the same intelligence layer the CLI and the
 * published datasets use: search, model details, alternatives, and
 * quality-vs-cost ranking with the Pareto frontier.
 *
 * @see docs/09_Model_Offering_v2.md
 */

export type { McpRequest, McpServerDeps } from './handler.js';
export { handleMcpRequest } from './handler.js';
