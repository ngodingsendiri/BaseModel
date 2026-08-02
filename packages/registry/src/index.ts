import type {
  Api,
  Benchmark,
  Capability,
  License,
  Model,
  Pricing,
  Provider,
} from '@basemodel/schema';
import {
  ApiSchema,
  BenchmarkSchema,
  CapabilitySchema,
  LicenseSchema,
  ModelSchema,
  PricingSchema,
  ProviderSchema,
} from '@basemodel/schema';
import {
  clearRegistryDirectory,
  readAllArraysFromDirectory,
  readAllFromDirectory,
  readRegistryFile,
  writeRegistryFile,
} from './storage.js';
import { validate } from './validation.js';

export * from './merge.js';
// Re-export storage, validation, and merge utilities for convenience
export * from './storage.js';
export * from './validation.js';

/**
 * Stamps `updated_at` on an entity so the registry records when a row was
 * last refreshed. Consumers can compare it across snapshots to detect stale
 * or never-refreshed entries (which lack the field entirely).
 */
export function stampUpdatedAt<T extends object>(entity: T): T & { updated_at: string } {
  return { ...entity, updated_at: new Date().toISOString() };
}

// --- Provider ---

export async function getAllProviders(): Promise<Provider[]> {
  const raw = await readAllFromDirectory('providers');
  return raw.map((r) => ProviderSchema.parse(r));
}

export async function getProvider(providerId: string): Promise<Provider | null> {
  const raw = await readRegistryFile<unknown>(`providers/${providerId}.json`);
  if (!raw) return null;
  const result = validate(ProviderSchema, raw);
  return result.success ? (result.data as Provider) : null;
}

export async function saveProvider(provider: Provider): Promise<void> {
  await writeRegistryFile(`providers/${provider.provider_id}.json`, stampUpdatedAt(provider));
}

// --- Model ---

export async function getAllModels(): Promise<Model[]> {
  const raw = await readAllFromDirectory('models');
  return raw.map((r) => ModelSchema.parse(r));
}

export async function getModel(modelId: string): Promise<Model | null> {
  // model_id format: "openai/gpt-4o" => file path: models/openai/gpt-4o.json
  const raw = await readRegistryFile<unknown>(`models/${modelId}.json`);
  if (!raw) return null;
  const result = validate(ModelSchema, raw);
  return result.success ? (result.data as Model) : null;
}

export async function getModelsByProvider(providerId: string): Promise<Model[]> {
  const all = await getAllModels();
  return all.filter((m) => m.provider_id === providerId);
}

export async function saveModel(model: Model): Promise<void> {
  await writeRegistryFile(`models/${model.model_id}.json`, stampUpdatedAt(model));
}

// --- Capability ---

export async function getAllCapabilities(): Promise<Capability[]> {
  const raw = await readAllFromDirectory('capabilities');
  return raw.map((r) => CapabilitySchema.parse(r));
}

// --- Benchmark ---

export async function getAllBenchmarks(): Promise<Benchmark[]> {
  const raw = await readAllFromDirectory('benchmarks');
  return raw.map((r) => BenchmarkSchema.parse(r));
}

export async function getBenchmark(benchmarkId: string): Promise<Benchmark | null> {
  const raw = await readRegistryFile<unknown>(`benchmarks/${benchmarkId}.json`);
  if (!raw) return null;
  const result = validate(BenchmarkSchema, raw);
  return result.success ? (result.data as Benchmark) : null;
}

export async function saveBenchmark(benchmark: Benchmark): Promise<void> {
  await writeRegistryFile(`benchmarks/${benchmark.benchmark_id}.json`, benchmark);
}

export async function clearBenchmarksRegistry(): Promise<void> {
  await clearRegistryDirectory('benchmarks');
}

// --- Pricing ---

export async function getAllPricing(): Promise<Pricing[]> {
  const raw = await readAllArraysFromDirectory('pricing');
  return raw.map((r) => PricingSchema.parse(r));
}

/**
 * Persists all pricing records for a single provider as one array file.
 * Overwrites any existing records for that provider.
 */
export async function savePricingRecords(providerId: string, records: Pricing[]): Promise<void> {
  await writeRegistryFile(
    `pricing/${providerId}.json`,
    records.map((r) => stampUpdatedAt(r)),
  );
}

/**
 * Removes all pricing files so the registry can be rewritten atomically.
 */
export async function clearPricingRegistry(): Promise<void> {
  await clearRegistryDirectory('pricing');
}

// --- API ---

export async function getAllApis(): Promise<Api[]> {
  const raw = await readAllFromDirectory('apis');
  return raw.map((r) => ApiSchema.parse(r));
}

// --- License ---

export async function getAllLicenses(): Promise<License[]> {
  const raw = await readAllFromDirectory('licenses');
  return raw.map((r) => LicenseSchema.parse(r));
}

export async function getLicense(licenseId: string): Promise<License | null> {
  const raw = await readRegistryFile<unknown>(`licenses/${licenseId}.json`);
  if (!raw) return null;
  const result = validate(LicenseSchema, raw);
  return result.success ? (result.data as License) : null;
}
