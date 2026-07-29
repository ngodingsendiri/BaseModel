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
