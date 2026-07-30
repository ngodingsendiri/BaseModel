# BaseModel Architecture

This document describes the major components of BaseModel and the responsibility of each component.

## Layers

### 1. Discovery Layer

The discovery layer finds sources that may contain useful AI model data.

Examples include provider sites, model catalogs, documentation pages, and benchmark sources.

In this repository, discovery is implemented through gateway and provider collectors in `packages/collectors`.

### 2. Registry Layer

The registry layer stores canonical records after validation and normalization.

It is the source of truth for providers, models, capabilities, pricing, licenses, APIs, and benchmark records.

In this repository, the registry layer lives in `packages/registry`.

### 3. Intelligence Layer

The intelligence layer derives search, alternatives, and cost information from registry data.

It does not modify canonical records.

In this repository, the intelligence layer lives in `packages/intelligence`.

### 4. Publishing Layer

The publishing layer converts registry and intelligence data into public datasets.

In this repository, the publisher writes static JSON outputs to `dist/`.

## Package Mapping

- `@basemodel/schema` defines canonical schemas and types.
- `@basemodel/registry` reads, writes, and validates registry files.
- `@basemodel/collectors` discovers and collects gateway data.
- `@basemodel/intelligence` computes derived model intelligence.
- `@basemodel/publisher` generates the public datasets.
- `@basemodel/cli` exposes the intelligence layer from the terminal.

## Boundaries

BaseModel intentionally does not include:

- Inference runtimes
- GPU execution
- Chat interfaces
- Prompt management
- Runtime orchestration
- Model hosting

These systems consume BaseModel data. They are not part of BaseModel itself.

## Relationship To The Pipeline

Architecture describes the components. The pipeline describes the order in which data moves through those components.

| Pipeline Stage | Architecture Layer |
| --- | --- |
| Discovery | Discovery Layer |
| Collection | Discovery Layer |
| Validation | Registry Layer |
| Normalization | Registry Layer |
| Registry | Registry Layer |
| Intelligence | Intelligence Layer |
| Generation | Publishing Layer |
| Publication | Publishing Layer |

## Stability

The architecture should remain stable even if implementation details, libraries, or infrastructure change.
