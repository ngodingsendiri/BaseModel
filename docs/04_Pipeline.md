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

#### AI Gateway Generation

Providers whose APIs do not match the OpenAI-compatible shape can register a
gateway in `packages/collectors/manifest.json` (base URL, auth, and optionally a
static sample response). A free-tier LLM then generates a custom gateway plugin:

1. `pnpm --filter @basemodel/collectors run gen-gateway <id>` probes the
   endpoint (or uses the sample), captures a redacted fixture, and summarizes
   the response shape.
2. The LLM writes `packages/collectors/src/gateways/<id>.ts` implementing the
   `CustomGateway` contract.
3. Output is structurally validated before use (importable module, correct id,
   `collect()` present, no forbidden patterns such as `any` or hardcoded keys)
   and retried up to 3 times.
4. `--heal` regenerates a plugin from its existing fixture when a sample changes
   or a mapping breaks.

Generated plugins are proposed through a pull request and must be reviewed
before merge. See `docs/08_Gateway_Plugin_Security.md`.

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

## Automation

The pipeline is automated through GitHub Actions:

- `ci.yml` validates the workspace.
- `collect.yml` performs nightly collection and regeneration.
- `publish.yml` regenerates datasets on push to `main`.
- `deploy-pages.yml` publishes the generated static files.
- `verify-gateway.yml` checks gateway plugin changes.
- `gateway-ai.yml` generates gateway plugins with an LLM and opens a review PR; it also validates the manifest on PRs that touch it.
