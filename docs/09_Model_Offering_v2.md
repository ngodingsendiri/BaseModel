# 09 — Model vs Offering (v2 Data Model)

This document describes the v2 data layer published alongside the v1
datasets. It turns the registry from "one record per provider serve" into an
explicit graph of **canonical physical models** and **per-provider
offerings**, and adds benchmark-derived quality intelligence on top.

## Motivation

The v1 registry stores one `Model` record per provider offering. Physical
identity had to be inferred with slug heuristics (`physicalSlug`, router
tier propagation, last-segment benchmark matching). That made several
questions impossible or fragile:

- "Where is model X cheapest?" — offerings of the same physical model were
  unrelated records.
- "Best model for use case X under budget Y?" — benchmark scores and pricing
  were never joined.
- "What changed since yesterday?" — snapshots were overwritten in place.

## Entities

### Canonical Model (`dist/v2/models.json`)

One record per physical model, identified by a provider-less slug
(e.g. `gpt-4o`). Carries attributes of the model itself:

- identity: `name`, `family`, `description`, `release_date`, `license_id`
- capabilities: modality union, capability flags OR-merged across offerings
- best known `context_window` across offerings
- `aliases`: every offering slug resolving to this model
- `offering_ids`: every offering serving this model
- `quality`: benchmark-derived score (see below)
- `status`: `active` when at least one offering is active

### Offering (`dist/v2/offerings.json`)

One record per v1 registry model (i.e. per provider serve). Carries the
economics and lifecycle that differ per provider:

- `model_id`: the canonical model it serves
- `provider_id`, `status`, `context_window`
- `cost_tier`, `blended_cost_per_1m` from that offering's own pricing rows
- `is_cheapest`: the cheapest active offering of its canonical model

### Quality & Pareto ranking (`dist/v2/intelligence.json`)

`quality.score` is the average of normalized benchmark scores (0–100) whose
`model_id` matches the canonical slug; `categories` and `sources` record
coverage. The ranking table lists every active, quality-scored canonical
model ordered by quality (cheapest cost as tiebreaker), with
`pareto_optimal` marking models no other model beats on both quality and
cost. This powers the "best model for use-case X under budget Y" query.

## Resolution semantics

`resolveCanonicalModels()` (in `packages/intelligence`) is deterministic:

1. Offerings are grouped by normalized slug (dots become dashes, embedded
   router prefixes are dropped).
2. The representative offering comes from a non-router provider when one
   exists, so descriptive fields prefer first-party data.
3. Modality is a union, capability flags OR-merge, context window takes the
   maximum, status takes the best lifecycle across offerings.

Resolution is deliberately conservative: grouping is slug-based only.
Curated alias overrides belong in the curation overlay (not yet
implemented), not in heuristics.

## Integrity guarantees

- Both v2 datasets validate against `CanonicalModelSchema` /
  `OfferingSchema`; the dataset contract test asserts referential integrity
  (every offering resolves to a canonical model, every `offering_ids` entry
  exists) on every run.
- `dist/manifest.json` carries a SHA-256 checksum per published file so
  consumers can verify snapshot integrity.
- `dist/changes.json` reports additions, removals, and status transitions
  versus the previously committed snapshot.
- v1 datasets are still generated exactly as before; v2 is additive.

## Consumers

- CLI: `basemodel best [--category X] [--max-cost Y] [--min-context Z]`.
- MCP server (`packages/mcp`): tools `search_models`, `model_info`,
  `alternatives`, `best_models` over stdio JSON-RPC.
- Direct consumers: `dist/v2/models.json`, `dist/v2/offerings.json`,
  `dist/v2/intelligence.json`, and the CSV export `dist/v2/models.csv`.

## Not yet implemented

Tracked as follow-ups, not shipped:

- Immutable snapshot storage outside git history (release artifacts /
  object storage) with a retention policy.
- Curation overlay (`data/curated/`) applied at generation time, including
  manual alias overrides.
- Cross-provider anomaly detection and per-field confidence/provenance.
- Delta collection and latency/throughput telemetry.
- npm data package, dataset signing, and `v2` deprecation policy for v1.
