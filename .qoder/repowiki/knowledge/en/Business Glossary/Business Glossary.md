---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### BaseModel
- Definition：An open-source AI model intelligence platform that discovers, validates, normalizes, stores, analyzes, and publishes structured knowledge about AI models. It is explicitly not an inference runtime or end-user application — it is a static data layer consumed by other systems.

### Registry Layer
- Definition：The canonical data store layer (implemented in `packages/registry`) that holds validated, normalized records for providers, models, capabilities, pricing, licenses, APIs, and benchmarks under `data/registry/`. It is the single source of truth for all downstream layers.
- Aliases：registry、data/registry

### Discovery Layer
- Definition：The top-of-pipeline layer (in `packages/collectors`) responsible for finding and collecting data from external sources such as provider sites, model catalogs, documentation pages, and benchmark repositories via gateway and provider collectors.
- Aliases：discovery、collectors

### Intelligence Layer
- Definition：The derivation layer (in `packages/intelligence`) that computes search results, alternative model suggestions, and cost efficiency tiers from registry data without modifying the canonical records themselves.
- Aliases：intelligence

### Publishing Layer
- Definition：The output layer (in `packages/publisher`) that converts registry and intelligence data into public JSON datasets written to `dist/` and distributed via GitHub Pages or repository artifacts.
- Aliases：publisher、dist

### Gateway Plugin
- Definition：A collector plugin implementing an OpenAI-compatible or custom gateway interface; each plugin runs in an isolated worker process (`fork()`) with a minimal env allowlist and secrets sourced only from the centralized registry, enforcing strict security boundaries.
- Aliases：gateway、collector plugin

### Pricing Enrichment
- Definition：The pipeline stage that derives pricing, limits, and cost tiers for every registry model by merging three sources in priority order: provider-declared `pricingSource`, OpenRouter aggregate catalog, and Hugging Face Inference Providers. Tier propagation copies only coarse tiers (never raw prices) across router reseller aliases.
- Aliases：enrich、pricing enrichment

### Tier Definitions
- Definition：Cost classification derived from blended per-1M-token cost `(input * 3 + output * 1) / 4`: `free` ($0 both sides), `budget` (< $0.50), `balanced` ($0.50–$5), `premium` (>$5). Published alongside `tier_definitions` and `blend` in metadata.
- Aliases：cost tier、tier

### Fail Loudly
- Definition：Enrichment policy where partial failures continue processing but total failure across all pricing sources marks the run `fatal` and exits non-zero, preventing CI from committing stale data silently. Per-source status and errors are recorded in `data/registry/meta.json`.
- Aliases：fail loudly、fatal flag

### Lifecycle Reconciliation
- Definition：Post-collection process that marks models `discontinued` if they no longer appear in a successfully fetched gateway catalog. Only error-free collections trigger deprecation, so auth failures, rate limits, or outages cannot accidentally deprecate entire provider model sets.
- Aliases：reconcileLifecycle、lifecycle

### Schema Versioning
- Definition：Version identifier (`schema_version`) attached to every generated dataset and metadata file, currently hardcoded to `'0.1.0'` in the publisher and not yet tied to the schema package version. No migration strategy or breaking-change policy exists yet for consumers.
- Aliases：schema_version
