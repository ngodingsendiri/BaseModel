import type { Capability, Model, Pricing, Provider } from '@basemodel/schema';

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

  // @ts-ignore
  public isLoaded = false;

  /**
   * Initializes the engine by loading all registry data into memory.
   * Uses dynamic imports so the engine can be instantiated in browser environments
   * without crashing due to 'fs' dependencies.
   */
  async init(): Promise<void> {
    if (this.isLoaded) return;

    // @ts-ignore
    if (typeof window !== 'undefined') {
      throw new Error('init() uses Node.js fs. In the browser, hydrate the engine properties manually.');
    }

    const registry = await import('@basemodel/registry');
    this.models = await registry.getAllModels();
    this.providers = await registry.getAllProviders();
    this.capabilities = await registry.getAllCapabilities();
    this.pricing = await registry.getAllPricing();

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
