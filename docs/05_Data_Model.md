# BaseModel Data Model

This document defines the canonical domain model of BaseModel.

The data model describes the core concepts of the AI ecosystem independently from any programming language, database, API, or serialization format.

Every collector, validator, registry, dataset, API, SDK, and application built on BaseModel must derive from this model.

---

# Purpose

The purpose of the data model is to define:

* The entities that exist within BaseModel.
* The responsibility of each entity.
* The relationships between entities.
* The canonical identifiers.
* The ownership of information.

The data model is the single source of truth for every schema used by BaseModel.

---

# Design Principles

The data model follows these principles.

## Canonical

Each real-world concept has exactly one canonical representation.

---

## Provider Agnostic

The model represents the AI ecosystem rather than any individual provider.

Every provider follows the same structure.

---

## Stable

The domain model should evolve slowly.

Implementations may change.

The model should remain stable.

---

## Extensible

Future entities should extend the model rather than replace existing ones.

Breaking changes should be avoided whenever possible.

---

## Normalized

Each entity owns only the information that belongs to it.

Information should not be duplicated across entities.

---

# Core Entities

```text
Provider
    │
    └── owns
            │
            ▼
          Model
        ┌──┼──────────────┬─────────────┬─────────────┐
        ▼  ▼              ▼             ▼             ▼
Capability Benchmark   Pricing         API        License
```

Each entity has a single responsibility.

---

# Entity: Provider

Represents an organization that develops, publishes, hosts, or distributes AI models.

Examples:

* OpenAI
* Anthropic
* Google
* Meta
* Alibaba
* Mistral AI

Primary Identifier

* provider_id

Core Attributes

* name
* organization
* website
* documentation
* country
* description
* status

Relationships

* Owns zero or more models.

A Provider represents the organization itself.

It does not describe how individual models are accessed.

---

# Entity: Model

Represents a uniquely identifiable AI model.

Examples:

* GPT-5
* Claude Sonnet
* Gemini 3 Pro
* DeepSeek R1
* Qwen3-Coder

Primary Identifier

* model_id

Relationships

* Belongs to one Provider.
* Supports many Capabilities.
* Has zero or more Benchmark results.
* Has one or more Pricing records.
* Is exposed through one or more APIs.
* Is governed by one License.

Core Attributes

* name
* family
* version
* release_date
* architecture
* parameter_size
* context_window
* modality
* open_weight
* reasoning_support
* function_calling
* structured_output
* vision_support
* audio_support
* image_support
* embedding_support
* status

The Model is the central entity of BaseModel.

---

# Entity: Capability

Represents a capability that can be supported by multiple models.

Examples include:

* Text Generation
* Code Generation
* Vision
* Image Generation
* Audio Understanding
* Embeddings
* Tool Calling
* Reasoning

Primary Identifier

* capability_id

Relationships

* Shared by many Models.

---

# Entity: Benchmark

Represents an evaluation result for a model.

Examples include:

* MMLU
* GPQA
* SWE-bench
* HumanEval
* MMMU

Primary Identifier

* benchmark_id

Core Attributes

* benchmark_name
* version
* score
* evaluation_date
* source

Relationships

* References one Model.

---

# Entity: Pricing

Represents how a model is priced.

Examples include:

* Free
* Input Token
* Output Token
* Cached Token
* Rate Limit

Primary Identifier

* pricing_id

Core Attributes

* pricing_type
* currency
* unit
* value

Relationships

* References one Model.

---

# Entity: API

Represents one method of accessing a model.

Examples include:

* OpenAI Compatible API
* Native REST API
* Ollama
* LM Studio
* vLLM

Primary Identifier

* api_id

Core Attributes

* protocol
* endpoint
* compatibility
* authentication
* rate_limits

Relationships

* References one Model.

API describes **how a model is consumed**, not the organization that owns it.

---

# Entity: License

Represents the legal terms governing a model.

Examples include:

* MIT
* Apache 2.0
* Proprietary
* Llama License

Primary Identifier

* license_id

Core Attributes

* name
* commercial_use
* redistribution
* modification
* source_available

Relationships

* References one Model.

---

# Entity Relationships

```text
Provider
    │
    └── owns
            │
            ▼
          Model
        ├───────────────┐
        │               │
        ▼               ▼
 Capability        Benchmark
        │
        ├───────────────┬──────────────┐
        ▼               ▼              ▼
    Pricing           API         License
```

Relationships describe ownership and association only.

They never define implementation details.

---

# Entity Ownership

Each entity owns its own information.

Provider owns:

* Organization metadata.

Model owns:

* Technical characteristics.

Capability owns:

* Functional features.

Benchmark owns:

* Evaluation results.

Pricing owns:

* Commercial information.

API owns:

* Access information.

License owns:

* Legal information.

This separation prevents duplicated information and keeps the model normalized.

---

# Identifiers

Every entity must have a globally unique identifier.

Identifiers should be:

* Stable
* Immutable
* Human-readable whenever practical
* Independent of provider-specific implementations

**Identifier Convention:**
BaseModel exclusively uses a `kebab-case` convention.
* **provider_id**: A URL-safe slug representing the provider (e.g., `openai`, `anthropic`, `google`).
* **model_id**: A combination of the provider ID and the model slug (e.g., `openai/gpt-4o`, `google/gemini-1.5-pro`).

Identifiers are the foundation of every relationship inside BaseModel.

---

# Versioning

The data model itself is versioned.

Generated datasets should include:

* schema_version
* generated_at
* source_revision

This allows consumers to safely migrate across releases.

---

# Future Expansion

The model intentionally starts small.

Potential future entities include:

* Hardware Requirements
* Safety Evaluations
* Region Availability
* Fine-tuning Support
* Deployment Targets

New entities should extend the model without changing existing relationships.

---

# Out of Scope

The data model intentionally excludes:

* AI inference
* Prompt templates
* Conversations
* Chat history
* GPU execution
* User accounts
* Billing systems
* Authentication
* Runtime orchestration

These belong to applications built on top of BaseModel.

---

# Final Statement

The BaseModel Data Model defines the canonical representation of the AI ecosystem.

Every implementation—whether JSON datasets, APIs, SDKs, databases, or future applications—should derive from this model.

By separating entities according to their responsibilities, BaseModel remains provider-agnostic, extensible, and maintainable while preserving a consistent understanding of AI models across the ecosystem.
