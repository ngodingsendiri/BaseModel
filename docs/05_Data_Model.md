# BaseModel Data Model

This document defines the canonical domain model for BaseModel.

## Purpose

The data model defines:

- The entities that exist in BaseModel
- The responsibility of each entity
- The relationships between entities
- The canonical identifiers
- The ownership of information

## Design Principles

- Canonical: each real-world concept has one canonical representation.
- Provider agnostic: the model describes the ecosystem, not a single provider.
- Stable: the domain model should evolve slowly.
- Extensible: future entities should extend the model rather than replace it.
- Normalized: each entity owns the information that belongs to it.

## Core Entities

### Provider

Represents an organization that develops, publishes, hosts, or distributes AI models.

Fields:

- `provider_id`
- `name`
- `organization`
- `website`
- `documentation` (optional)
- `country` (optional)
- `description` (optional)
- `provider_type`
- `status`

### Model

Represents a uniquely identifiable AI model.

Fields:

- `model_id`
- `provider_id`
- `name`
- `family` (optional)
- `version` (optional)
- `release_date` (optional)
- `description` (optional)
- `architecture` (optional)
- `parameter_size` (optional)
- `context_window` (optional)
- `modality`
- `open_weight`
- `reasoning_support`
- `function_calling`
- `structured_output`
- `vision_support`
- `audio_support`
- `image_generation`
- `embedding_support`
- `capability_ids`
- `license_id` (optional)
- `status`

### Capability

Represents a normalized capability that can be shared by many models.

Fields:

- `capability_id`
- `name`
- `description` (optional)

### Benchmark

Represents an evaluation result for a model.

Fields:

- `benchmark_id`
- `model_id`
- `benchmark_name`
- `version` (optional)
- `score`
- `score_raw` (optional)
- `evaluation_date` (optional)
- `source`

### Pricing

Represents pricing information for a model.

Fields:

- `pricing_id`
- `model_id`
- `pricing_type`
- `currency` (optional)
- `unit` (optional)
- `value` (optional)
- `notes` (optional)

### API

Represents one method of accessing a model.

Fields:

- `api_id`
- `model_id`
- `protocol`
- `endpoint` (optional)
- `compatibility` (optional)
- `authentication`
- `rate_limits` (optional)

### License

Represents the legal terms governing a model.

Fields:

- `license_id`
- `name`
- `commercial_use`
- `redistribution`
- `modification`
- `source_available`
- `url` (optional)

## Identifiers

- `provider_id` uses kebab-case.
- `model_id` uses the format `{provider_id}/{model-slug}`.
- Other entity identifiers use stable, human-readable identifiers whenever practical.

## Dataset Metadata

Generated datasets include:

- `schema_version`
- `source_revision`
- `count`

The current generator does not emit a `generated_at` field.

## Out Of Scope

The data model intentionally excludes:

- AI inference
- Prompt templates
- Conversations
- Chat history
- GPU execution
- User accounts
- Billing systems
- Runtime orchestration

## Final Statement

Every implementation in BaseModel should derive from this domain model.
