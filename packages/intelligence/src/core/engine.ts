import type { Capability, Model, Pricing, Provider } from '@basemodel/schema';

export interface IntelligenceSnapshot {
  models: Model[];
  providers: Provider[];
  capabilities?: Capability[];
  pricing?: Pricing[];
}

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
  public isLoaded = false;

  /**
   * Hydrates the engine from an already-loaded dataset snapshot.
   * This is the browser-safe path for apps consuming published JSON files.
   */
  hydrate(snapshot: IntelligenceSnapshot): void {
    this.models = snapshot.models;
    this.providers = snapshot.providers;
    this.capabilities = snapshot.capabilities ?? [];
    this.pricing = snapshot.pricing ?? [];
    this.isLoaded = true;
  }

  /**
   * Initializes the engine by loading all registry data into memory.
   * Uses an indirect dynamic import so browser builds can exclude Node-only registry code.
   */
  async init(): Promise<void> {
    if (this.isLoaded) return;

    if ('window' in globalThis) {
      throw new Error('init() uses Node.js fs. In the browser, hydrate the engine manually.');
    }

    const registryPackageName = '@basemodel/registry';
    const registry = (await import(registryPackageName)) as typeof import('@basemodel/registry');
    this.hydrate({
      models: await registry.getAllModels(),
      providers: await registry.getAllProviders(),
      capabilities: await registry.getAllCapabilities(),
      pricing: await registry.getAllPricing(),
    });
  }

  /**
   * Helper to ensure data is loaded before running operations.
   */
  public ensureLoaded(): void {
    if (!this.isLoaded) {
      throw new Error(
        'IntelligenceEngine is not initialized. Call await init() or hydrate() first.',
      );
    }
  }
}
