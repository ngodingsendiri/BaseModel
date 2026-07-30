# BaseModel Philosophy

This document defines the principles that should remain stable even when the implementation changes.

## Principles

1. Data is the product.

   BaseModel exists to produce structured, accurate, and continuously updated data.

2. Intelligence, not inference.

   BaseModel provides information about models. It does not run the models.

3. Provider agnostic.

   No provider should receive special treatment in the schema or architecture.

4. Normalize everything.

   Different providers describe the same concept in different ways. BaseModel should reduce that variation to one canonical schema.

5. Truth over completeness.

   Missing data is acceptable. Incorrect data is not.

6. Provenance matters.

   Important facts should be traceable to a source whenever practical.

7. Automation first.

   Discovery, validation, normalization, ranking, and publication should be automatable.

8. Plugins over hardcoding.

   New collectors, benchmarks, and ranking strategies should extend the system without rewriting the core.

9. Static first.

   Whenever possible, BaseModel should publish static datasets that are easy to cache, review, and mirror.

10. Schema first.

    Define the data contract before building a new collector, API, or dataset.

11. Transparency by default.

    Consumers should be able to understand why a record exists and how it was derived.

12. GitHub is the delivery pipeline.

    GitHub Actions, GitHub Pages, and repository history are part of the publishing workflow.

## Engineering Mindset

Prefer:

- Simplicity over complexity
- Structured data over unstructured text
- Reproducibility over convenience
- Open standards over proprietary formats
- Long-term maintainability over short-term optimization

## Decision Check

When evaluating a change, ask:

- Does it improve data quality?
- Does it keep the architecture modular?
- Can it be automated?
- Does it preserve provider neutrality?
- Will it still make sense in five years?

If most answers are yes, the change likely belongs in BaseModel.
