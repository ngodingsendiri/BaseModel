/**
 * @basemodel/schema
 *
 * Canonical Zod schemas and TypeScript types for all BaseModel entities.
 * This package is the single source of truth for data structures used across
 * the entire BaseModel platform.
 *
 * @see docs/05_Data_Model.md
 */

export { ProviderSchema } from './provider.js';
export type { Provider } from './provider.js';

export { ModelSchema } from './model.js';
export type { Model } from './model.js';

export { CapabilitySchema } from './capability.js';
export type { Capability } from './capability.js';

export { BenchmarkSchema } from './benchmark.js';
export type { Benchmark } from './benchmark.js';

export { PricingSchema } from './pricing.js';
export type { Pricing } from './pricing.js';

export { ApiSchema } from './api.js';
export type { Api } from './api.js';

export { LicenseSchema } from './license.js';
export type { License } from './license.js';
