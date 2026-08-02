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

### Registry

The registry stores canonical files under `data/registry/`.

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

Each file includes `schema_version`, `source_revision`, and `count` metadata.

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
model from two public catalogs:

| Source | Scope | Endpoint | Auth |
|---|---|---|---|
| OpenRouter | Aggregated pricing for hundreds of models | `https://openrouter.ai/api/v1/models` | none (optional key) |
| Hugging Face Inference Providers | Open-weight models served by partner backends | `https://router.huggingface.co/v1/models` | none (optional token) |

OpenRouter is the primary source. When it has no entry, Hugging Face is tried
as a fallback for open-weight models (for example `deepinfra/deepseek-v3-0324`).
Only entries that report pricing are used, so a catalog hit can never clear an
existing tier.

### Tier propagation

Models re-served by router providers (`requesty`, `vercel`, `openrouter`) do
not have their own price; they resell an upstream model. For those aliases the
enrich step propagates the coarse cost **tier** (and free flag) from any other
provider of the same physical model, preferring first-party sources. Prices are
never copied between providers, because router markup differs from the upstream
provider.

## Automation

The pipeline is automated through GitHub Actions:

- `ci.yml` validates the workspace.
- `collect.yml` performs nightly collection and regeneration.
- `publish.yml` regenerates datasets on push to `main`.
- `deploy-pages.yml` publishes the generated static files.
- `verify-gateway.yml` checks gateway plugin changes.
