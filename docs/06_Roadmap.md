# BaseModel Roadmap

This document describes the current direction of the project rather than a fixed delivery schedule.

## Current State

BaseModel already has the core layers in place:

- Canonical schemas in `packages/schema`
- Registry storage and validation in `packages/registry`
- Provider and gateway collection in `packages/collectors`
- Derived intelligence in `packages/intelligence`
- Dataset generation in `packages/publisher`
- CLI access in `packages/cli`
- Nightly and release workflows in `.github/workflows/`

## Near-Term Priorities

- Broader provider and gateway coverage
- More benchmark sources and stronger provenance
- Safer plugin execution and privilege boundaries
- Better retry, timeout, and failure handling for collectors
- More tests around workflow behavior and generated datasets
- Cleaner developer documentation and examples

## Long-Term Direction

BaseModel should remain:

- Provider agnostic
- Schema driven
- Deterministic
- Static first
- Easy to consume from other tools
- Stable enough to support long-term ecosystem use

## What BaseModel Should Not Become

BaseModel should not turn into:

- An inference platform
- A chatbot product
- A model hosting service
- A GPU runtime
- A prompt management system
- A workflow automation platform

## Success Criteria

The project succeeds when consumers can rely on BaseModel as a trusted and reproducible source of AI model intelligence.
