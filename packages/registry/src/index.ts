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
  await writeRegistryFile(`providers/${provider.provider_id}.json`, provider);
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

export async function saveModel(model: Model): Promise<void> {
  await writeRegistryFile(`models/${model.model_id}.json`, model);
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

// --- Pricing ---

export async function getAllPricing(): Promise<Pricing[]> {
  const raw = await readAllArraysFromDirectory('pricing');
  return raw.map((r) => PricingSchema.parse(r));
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
