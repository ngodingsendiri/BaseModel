import type { Benchmark, Capability, Model, Pricing, Provider } from '@basemodel/schema';
import {
  BenchmarkSchema,
  CapabilitySchema,
  ModelSchema,
  PricingSchema,
  ProviderSchema,
} from '@basemodel/schema';

export interface IntelligenceSnapshot {
  models: Model[];
  providers: Provider[];
  capabilities?: Capability[];
  pricing?: Pricing[];
  benchmarks?: Benchmark[];
}

function parseSnapshot(snapshot: IntelligenceSnapshot): Required<IntelligenceSnapshot> {
  const models = ModelSchema.array().safeParse(snapshot.models);
  const providers = ProviderSchema.array().safeParse(snapshot.providers);
  const capabilities = CapabilitySchema.array().safeParse(snapshot.capabilities ?? []);
  const pricing = PricingSchema.array().safeParse(snapshot.pricing ?? []);
  const benchmarks = BenchmarkSchema.array().safeParse(snapshot.benchmarks ?? []);

  if (
    !models.success ||
    !providers.success ||
    !capabilities.success ||
    !pricing.success ||
    !benchmarks.success
  ) {
    const errors = [models, providers, capabilities, pricing, benchmarks]
      .filter((result) => !result.success)
      .flatMap((result) => (result.success ? [] : result.error.errors));
    throw new Error(`Invalid intelligence snapshot: ${JSON.stringify(errors)}`);
  }

  return {
    models: models.data,
    providers: providers.data,
    capabilities: capabilities.data,
    pricing: pricing.data,
    benchmarks: benchmarks.data,
  };
}

/**
 * The core Intelligence Engine.
 * It holds a defensive, validated snapshot of registry data in memory.
 */
export class IntelligenceEngine {
  public models: Model[] = [];
  public providers: Provider[] = [];
  public capabilities: Capability[] = [];
  public pricing: Pricing[] = [];
  public benchmarks: Benchmark[] = [];
  public isLoaded = false;
  private initPromise: Promise<void> | undefined;

  /** Hydrates the engine from a validated, browser-safe dataset snapshot. */
  hydrate(snapshot: IntelligenceSnapshot): void {
    const parsed = parseSnapshot(snapshot);
    this.models = parsed.models.slice();
    this.providers = parsed.providers.slice();
    this.capabilities = parsed.capabilities.slice();
    this.pricing = parsed.pricing.slice();
    this.benchmarks = parsed.benchmarks.slice();
    this.isLoaded = true;
  }

  /**
   * Initializes the engine once. Concurrent callers share the same load
   * operation; a failed load can be retried by a later caller.
   */
  async init(): Promise<void> {
    if (this.isLoaded) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadRegistry().catch((error: unknown) => {
      this.initPromise = undefined;
      throw error;
    });
    return this.initPromise;
  }

  private async loadRegistry(): Promise<void> {
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
      benchmarks: await registry.getAllBenchmarks(),
    });
  }

  public ensureLoaded(): void {
    if (!this.isLoaded) {
      throw new Error(
        'IntelligenceEngine is not initialized. Call await init() or hydrate() first.',
      );
    }
  }
}
