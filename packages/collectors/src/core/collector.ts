import type { Model } from '@basemodel/schema';

export interface CollectionResult {
  provider_id: string;
  models: Partial<Model>[];
  errors: string[];
}

/**
 * The standard interface for all API scrapers/collectors.
 * Implementing classes must fetch data from their respective provider's API
 * and normalize it into a list of Partial<Model> objects.
 */
export interface ModelCollector {
  /** The unique identifier of the provider this collector is for. */
  providerId: string;

  /** Fetches models from the provider's API, validates raw data, and normalizes it. */
  fetchModels(): Promise<CollectionResult>;
}

// ---------------------------------------------------------------------------
// Gateway Plugin System
// ---------------------------------------------------------------------------

/**
 * A "Simple" plugin for gateways that follow the OpenAI-compatible API format.
 * The runner engine knows how to handle these without any custom code.
 * Just drop a file in gateways/ with these 4 fields and you're done.
 */
export interface SimpleGateway {
  type: 'openai-compatible';
  /** Unique provider/gateway ID, e.g. 'openrouter'. Used as namespace prefix. */
  id: string;
  /** Base URL of the OpenAI-compatible endpoint, e.g. 'https://openrouter.ai/api/v1' */
  baseUrl: string;
  /**
   * The NAME of the environment variable (GitHub Secret) that holds the API key.
   * e.g. 'OPENROUTER_API_KEY'. The runner will look up process.env[secretKeyName].
   */
  secretKeyName: string;
}

/**
 * A "Custom" plugin for gateways with unique API formats (e.g. Anthropic, Google Gemini).
 * You write the full fetch & normalization logic inside `collect()`.
 */
export interface CustomGateway {
  type: 'custom';
  /** Unique provider/gateway ID, e.g. 'anthropic'. */
  id: string;
  /**
   * Full collection logic. Secrets (env vars) are injected by the runner.
   * Must return a CollectionResult with normalized Partial<Model> objects.
   */
  collect(secrets: Record<string, string | undefined>): Promise<CollectionResult>;
}

/** Union type for any gateway plugin. */
export type GatewayPlugin = SimpleGateway | CustomGateway;
