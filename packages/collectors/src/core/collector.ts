import type { Model } from '@basemodel/schema';

/**
 * Per-model pricing captured directly from a provider's API response.
 * Values are USD per 1M tokens. A model whose input AND output are both 0
 * is free; the fields are omitted when the provider does not expose them.
 */
export interface ProviderPricing {
  model_id: string;
  inputPer1M?: number;
  outputPer1M?: number;
}

export interface CollectionResult {
  provider_id: string;
  models: Partial<Model>[];
  errors: string[];
  /** Optional per-model pricing captured from the provider API response. */
  pricing?: ProviderPricing[];
}

export const MAX_PLUGIN_MODELS = 10_000;
export const MAX_PLUGIN_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * Interface for provider-specific collectors.
 * Implementations fetch provider data and normalize it into Partial<Model>
 * records that the registry can merge.
 */
export interface ModelCollector {
  /** The unique identifier of the provider this collector serves. */
  providerId: string;

  /** Fetches, validates, and normalizes models from the provider source. */
  fetchModels(): Promise<CollectionResult>;
}

/**
 * Gateway plugin metadata for OpenAI-compatible providers.
 */
export interface SimpleGateway {
  type: 'openai-compatible';
  /** Unique provider or gateway ID, for example `openrouter`. */
  id: string;
  /** Base URL of the OpenAI-compatible endpoint. */
  baseUrl: string;
  /** Approved secret name for the API key used by this gateway. */
  secretKeyName: string;
}

/**
 * Gateway plugin metadata for custom providers.
 * The custom `collect()` implementation runs in an isolated worker.
 */
export interface CustomGateway {
  type: 'custom';
  /** Unique provider or gateway ID, for example `anthropic`. */
  id: string;
  /** Full collection logic executed with only approved secrets. */
  collect(secrets: Record<string, string | undefined>): Promise<CollectionResult>;
}

/** Union type for supported gateway plugins. */
export type GatewayPlugin = SimpleGateway | CustomGateway;

/**
 * Serializable plugin metadata returned from the isolated worker process.
 * The collector process never imports a plugin directly.
 */
export type GatewayDescriptor =
  | Pick<SimpleGateway, 'type' | 'id' | 'baseUrl' | 'secretKeyName'>
  | Pick<CustomGateway, 'type' | 'id'>;
