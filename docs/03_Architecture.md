# BaseModel Architecture

This document defines the core architecture of BaseModel.

Unlike the pipeline, which describes how information moves through the system, this document defines the major components that make up the platform and the responsibility of each component.

The architecture should remain stable even if the implementation, programming language, or infrastructure changes.

---

# Architectural Philosophy

BaseModel is designed as a **data intelligence platform**.

Its primary product is **structured AI model intelligence**, not software itself.

Every architectural component exists to support one goal:

> Transform fragmented AI ecosystem information into trusted, standardized, and reusable datasets.

---

# High-Level Architecture

```text
                            BaseModel

        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  Discovery Layer      Registry Layer      Intelligence Layer
        │                     │                     │
        ▼                     ▼                     ▼
 Source Collectors      Canonical Data      Analysis Engines
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                      Publishing Layer
                              │
                              ▼
                   GitHub Pages & JSON API
                              │
                              ▼
                    SDKs • Applications • AI Runtimes
```

Each layer has a single responsibility.

Each layer communicates through well-defined schemas.

Each layer can evolve independently.

---

# Core Components

## 1. Discovery Layer

The Discovery Layer is responsible for finding information that may be useful to BaseModel.

It does not evaluate data.

It does not transform data.

Its only responsibility is discovering potential sources.

Examples include:

* AI providers
* Model catalogs
* Official documentation
* Benchmark platforms
* Community-maintained datasets
* Release announcements

Output:

A list of resources ready for collection.

---

## 2. Registry Layer

The Registry Layer is the canonical source of truth inside BaseModel.

Every entity stored in the registry follows BaseModel schemas.

The registry contains normalized information such as:

* Providers
* Models
* Capabilities
* API compatibility
* Pricing
* Context windows
* Modalities
* Benchmarks
* Metadata

The registry never stores provider-specific formats.

Consumers should never need provider-specific logic.

---

## 3. Intelligence Layer

The Intelligence Layer transforms registry data into useful knowledge.

This layer never modifies raw registry data.

Instead, it derives additional information from existing records.

Examples include:

* Rankings
* Recommendations
* Benchmark summaries
* Compatibility reports
* Provider comparisons
* Alternative model suggestions
* Health summaries

The intelligence layer is deterministic and reproducible.

---

## 4. Publishing Layer

The Publishing Layer converts internal registry data into public datasets.

Outputs may include:

* Static JSON datasets
* Public APIs
* SDK resources
* GitHub Pages
* Future distribution formats

The publishing layer does not create information.

It only exposes standardized intelligence for external consumers.

---

# Architectural Principles

The architecture follows these principles.

## Single Responsibility

Each layer owns one responsibility.

Responsibilities should not overlap.

---

## Schema-Driven

Every component communicates using documented schemas.

Schemas define contracts between layers.

---

## Provider Agnostic

Every provider follows the same lifecycle.

Adding support for a new provider should require adding a new collector, not redesigning the architecture.

---

## Deterministic

The same input should always produce the same output.

Published datasets should be reproducible.

---

## Extensible

New collectors.

New benchmark sources.

New ranking algorithms.

New recommendation strategies.

All should extend the platform without modifying its core.

---

## Static First

Whenever possible, BaseModel publishes static datasets.

Static artifacts are easier to version, cache, review, mirror, and consume.

Dynamic services should only exist when static outputs become insufficient.

---

# Architectural Boundaries

BaseModel intentionally does **not** include:

* AI inference
* GPU execution
* Chat interfaces
* Prompt management
* AI agents
* Runtime orchestration
* Model hosting

These systems consume BaseModel.

They are not part of BaseModel itself.

---

# Relationship Between Components

The architecture intentionally separates concerns.

```text
Discovery
    │
    ├── Finds information
    │
Registry
    │
    ├── Stores standardized information
    │
Intelligence
    │
    ├── Produces insights
    │
Publishing
    │
    └── Delivers datasets
```

No component should perform another component's responsibility.

---

# Relationship With the Pipeline

This document describes **what BaseModel is**.

It does **not** describe **how data flows**.

The complete data lifecycle is defined separately in:

> **04_Pipeline.md**

Keeping architecture and pipeline separate allows each to evolve independently.

---

# Long-Term Stability

The architecture is expected to remain stable over many years.

Implementation details may change.

Programming languages may change.

Storage technologies may change.

Publishing mechanisms may change.

The architecture should not.

---

# Final Statement

BaseModel is not designed around APIs, programming languages, or infrastructure.

It is designed around responsibilities.

By separating discovery, registry, intelligence, and publishing into independent architectural layers, BaseModel remains modular, extensible, and maintainable as the AI ecosystem continues to evolve.
