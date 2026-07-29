import {
  getAllModels,
  getAllProviders,
  getAllCapabilities,
  getAllPricing,
} from '@basemodel/registry';
import type { Model, Provider, Capability, Pricing } from '@basemodel/schema';

/**
 * The core Intelligence Engine.
 * It holds a read-only snapshot of the registry data in memory.
 * Features (search, alternatives, cost) will operate on this snapshot.
 */
export class IntelligenceEngine {
  public models: Model[] = [];
  public providers: Provider[] = [];
  public capabilities: Capability[] = [];
  public pricing: Pricing[] = [];

  private isLoaded = false;

  /**
   * Initializes the engine by loading all registry data into memory.
   */
  async init(): Promise<void> {
    if (this.isLoaded) return;

    this.models = await getAllModels();
    this.providers = await getAllProviders();
    this.capabilities = await getAllCapabilities();
    this.pricing = await getAllPricing();

    this.isLoaded = true;
  }

  /**
   * Helper to ensure data is loaded before running operations.
   */
  public ensureLoaded(): void {
    if (!this.isLoaded) {
      throw new Error('IntelligenceEngine is not initialized. Call await init() first.');
    }
  }
}
