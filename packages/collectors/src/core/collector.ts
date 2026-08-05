import type { Model } from '@basemodel/schema';

export interface CollectionResult {
  provider_id: string;
  models: Partial<Model>[];
  errors: string[];
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
 * Declarative pricing catalog source for an OpenAI-compatible gateway.
 *
 * When set, the enrich step fetches the catalog (best-effort) and uses it to
 * price models collected from that gateway. Field paths are optional and
 * default to the OpenAI-compatible `/models` shape the collectors use, so a
 * minimal declaration is just `{ url }`.
 */
export interface PricingSourceSpec {
  /** Catalog URL. Defaults to `${baseUrl}/models`. */
  url?: string;
  /** Whether to send the gateway secret as a Bearer token. Default: `none`. */
  auth?: 'none' | 'secret';
  /** Dot-path to the catalog array. Default: `data`. */
  itemsPath?: string;
  /** Field holding the model id. Default: `id`. */
  idField?: string;
  /** Dot-path to the input price. Default: `input_price`. */
  inputPriceField?: string;
  /** Dot-path to the output price. Default: `output_price`. */
  outputPriceField?: string;
  /** Field holding the context length. Default: `context_window`. */
  contextField?: string;
  /** Unit of the price fields. Default: `per-token`. */
  pricingUnit?: 'per-token' | 'per-1m';
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
  /** Optional pricing catalog consumed by the enrich step. */
  pricingSource?: PricingSourceSpec;
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
  /** Optional pricing catalog consumed by the enrich step. */
  pricingSource?: PricingSourceSpec;
}

/** Union type for supported gateway plugins. */
export type GatewayPlugin = SimpleGateway | CustomGateway;

/**
 * Serializable plugin metadata returned from the isolated worker process.
 * The collector process never imports a plugin directly.
 */
export type GatewayDescriptor =
  | Pick<SimpleGateway, 'type' | 'id' | 'baseUrl' | 'secretKeyName' | 'pricingSource'>
  | Pick<CustomGateway, 'type' | 'id' | 'pricingSource'>;
