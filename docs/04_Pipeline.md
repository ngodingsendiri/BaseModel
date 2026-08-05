# BaseModel Pipeline

This document describes how data moves through BaseModel.

## Overview

1. Discovery identifies sources that may need to be collected.
2. Collection retrieves structured data from those sources.
3. Validation rejects malformed or incomplete records.
4. Normalization converts source-specific data into canonical BaseModel schemas.
5. Registry stores the canonical records.
6. Intelligence derives search, alternative, and cost data from the registry.
7. Generation writes public JSON datasets to `dist/`.
8. Publication makes the generated datasets available to consumers.

## Stage Details

### Discovery

Discovery finds providers, models, documentation pages, and benchmark sources that may have changed.

### Collection

Collectors fetch data from official APIs, documentation, or other approved sources.

Current collector support includes both OpenAI-compatible gateway plugins and custom gateway plugins.

### Validation

Validation checks required fields, identifier formats, schema compliance, URL validity, and timestamp formats.

Invalid records are rejected before they reach the registry.

### Normalization

Normalization converts provider-specific representation into BaseModel's canonical schema.

Examples include canonical identifiers, capability names, pricing units, and API compatibility data.

OpenAI-compatible `/models` endpoints report no capability metadata, so the
generic collector classifies each model id with conservative heuristics
(`classifyApiModel`): embedding models, TTS/ASR models, image generators,
image-processing tools, video models, and code models get the correct
modality and flags instead of being stored as text-only chat models. When
nothing matches, the model stays a plain text model. Custom gateway plugins
may emit their own fields, which take precedence.

### Registry

The registry stores canonical files under `data/registry/`.

Model merges respect field ownership: machine-observable facts (context
window, status, name) refresh on every collection, while curated fields
(`description`, `family`, `release_date`, `architecture`, `parameter_size`,
plus `capability_ids` and `license_id`) are never overwritten by collector
data.

Current registry entities include:

- Providers
- Models
- Capabilities
- Pricing records
- API records
- Benchmark records
- License records

### Intelligence

The intelligence layer derives:

- Search results
- Alternative model suggestions
- Cost efficiency tiers

It does not modify registry data.

### Generation

The publisher writes the public datasets to `dist/`.

Current outputs are:

- `providers.json`
- `models.json`
- `capabilities.json`
- `licenses.json`
- `apis.json`
- `benchmarks.json`
- `pricing.json`
- `intelligence.json`
- `metadata.json`

Each file includes `schema_version`, `source_revision`, `generated_at`, and `count` metadata.

### Publication

Publication distributes the generated datasets through GitHub Pages, repository artifacts, or any other mirror that consumes the generated files.

## Failure Handling

- Invalid records are isolated.
- Valid records continue through the pipeline.
- Errors are logged.
- The registry should not contain partially processed data.

## Benchmark Sources

Benchmark and ranking data is collected by `@basemodel/collectors` from three
public sources. All of them are open and do not require a paid API key, so the
pipeline works out of the box:

| Source | Data | Endpoint | Auth |
|---|---|---|---|
| LMArena | Elo rankings (text/webdev/vision) | Hugging Face datasets-server | none (optional token) |
| Open LLM Leaderboard | Benchmark scores (MMLU-PRO, GPQA, ...) | Hugging Face datasets-server | none (optional token) |
| Mirror | Daily text/code leaderboard snapshot | GitHub raw files | none |

When LMArena is unreachable or rate-limited, the pipeline automatically falls
back to the Mirror snapshot so ranked data is still emitted on a degraded path.

### Hugging Face token (optional)

LMArena and Open LLM Leaderboard are served by the public Hugging Face
datasets-server. Without a token, unauthenticated requests share a rate limit
and can return `HTTP 429 Too Many Requests`, which triggers the Mirror fallback.

To get higher limits, create a free access token:

1. Sign up at <https://huggingface.co>.
2. Go to **Settings → Access Tokens** → **Create new token**.
3. Choose **Read** permissions and copy the token (e.g. `hf_xxxxxxxx`).
4. Add it as a repository secret named `BENCHMARKS_FETCH_TOKEN` in
   **Settings → Secrets and variables → Actions**.
5. `collect.yml` already injects it into the `collect-benchmarks` step.

The token is optional. Without it, the Mirror fallback still produces ranked
text/code data; with it, the primary LMArena and Open LLM Leaderboard sources
are used and the catalog is much larger.

## Pricing Enrichment

The enrich step derives pricing, limits, and cost tiers for every registry
model from three kinds of catalogs:

| Source | Scope | Endpoint | Auth |
|---|---|---|---|
| Provider `pricingSource` | A gateway's own resale prices (declared per plugin) | declared by each gateway | none or secret |
| OpenRouter | Aggregated pricing for hundreds of models | `https://openrouter.ai/api/v1/models` | none (optional key) |
| Hugging Face Inference Providers | Open-weight models served by partner backends | `https://router.huggingface.co/v1/models` | none (optional token) |

A gateway declares its own pricing catalog with the optional `pricingSource`
field on its plugin config (for example Requesty's
`https://router.requesty.ai/v1/models`, which is public and needs no token).
The enrich step discovers those declarations, fetches the catalogs best-effort,
and prices each provider's models from its own source first. Providers without
a `pricingSource` keep relying on the aggregate catalogs. Field paths default
to the OpenAI-compatible `/models` shape (`data`, `id`, `input_price`,
`output_price`, `context_window`, prices in USD per token), so a minimal
declaration is just `{ url }`.

OpenRouter is the aggregate primary source. When neither a provider's own
catalog nor OpenRouter has an entry, Hugging Face is tried as a fallback for
open-weight models (for example `deepinfra/deepseek-v3-0324`). Only entries
that report pricing are used, so a catalog hit can never clear an existing
tier.

### Tier propagation

Models re-served by router providers (`requesty`, `vercel`, `openrouter`) do
not have their own price; they resell an upstream model. For those aliases the
enrich step propagates the coarse cost **tier** (and free flag) from any other
provider of the same physical model, preferring first-party sources. Prices are
never copied between providers, because router markup differs from the upstream
provider.

## Data Governance

The pipeline publishes enough metadata for consumers to judge how fresh and
trustworthy a snapshot is.

### Freshness

- Every saved `Model`, `Pricing`, and `Provider` record carries an `updated_at`
  ISO 8601 timestamp set on each write. Records that were never re-saved lack
  the field entirely, which consumers can use to detect stale entries.
- Every generated dataset and `metadata.json` carries a `generated_at` timestamp
  for the run.

### Lifecycle

Models carry a `status` of `active`, `preview`, `deprecated`, or `discontinued`.
After a collection round, any model that a successfully fetched gateway catalog
no longer lists is marked `discontinued` (`reconcileLifecycle`). Reconciliation
only runs for error-free collections, so a failed fetch (auth, rate limit,
outage) can never deprecate an entire provider's models.

### Provenance

Every pricing record reports which source produced it via `source`:
`openrouter`, `huggingface`, or a gateway id such as `requesty` for a
provider-declared catalog. When several records exist for the same model and
pricing type, the intelligence layer picks deterministically by provenance:
the model's own provider catalog first, then OpenRouter, then other gateway
catalogs, then Hugging Face.

### Tier definitions

Tiers are derived from a blended per-1M-token cost
`(input * 3 + output * 1) / 4`:

| Tier | Rule |
|---|---|
| `free` | Both input and output cost $0 |
| `budget` | Blended < $0.50 |
| `balanced` | Blended >= $0.50 and <= $5 |
| `premium` | Blended > $5 |

The same definitions are published in `dist/metadata.json` (`tier_definitions`
and `blend`).

### Generation guarantees

The publisher validates all cross-entity relations (models → providers,
models → capabilities) **before** writing any dataset file, so a broken
registry can never produce a partially written `dist/`. Datasets report the
`schema_version` of the `@basemodel/schema` package they were generated
against. A dataset contract test (`packages/publisher`) runs the real
generator against the real registry on every CI run to guarantee schema
validity, relational integrity, and consistent metadata.

### Fail loudly

Enrichment no longer degrades silently:

- If the OpenRouter catalog fails, enrichment continues with the provider and
  Hugging Face sources instead of aborting early.
- If **all** primary pricing sources fail (OpenRouter plus every provider
  catalog plus Hugging Face), the run is marked `fatal` and the CLI exits
  non-zero so CI cannot commit stale data as if it were healthy.
- A `data/registry/meta.json` written by enrichment records `generated_at`,
  per-source status, and errors; the publisher surfaces it inside
  `dist/metadata.json`.

### Provider metadata

Provider `website` is optional and never fabricated. Unknown providers are
registered with derived name/type only; URLs are added when verified.

## Automation

The pipeline is automated through GitHub Actions:

- `ci.yml` validates the workspace.
- `collect.yml` performs nightly collection and regeneration.
- `publish.yml` regenerates datasets on push to `main`.
- `deploy-pages.yml` publishes the generated static files.
- `verify-gateway.yml` checks gateway plugin changes.
