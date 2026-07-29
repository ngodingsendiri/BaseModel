\# BaseModel Pipeline



This document defines how information flows through BaseModel.



Unlike the architecture, which defines the platform's components, the pipeline describes the lifecycle of data from discovery to publication.



Every piece of information published by BaseModel follows this pipeline.



\---



\# Pipeline Overview



```text

External Sources

&#x20;       │

&#x20;       ▼

&#x20;  Discovery

&#x20;       │

&#x20;       ▼

&#x20;  Collection

&#x20;       │

&#x20;       ▼

&#x20;  Validation

&#x20;       │

&#x20;       ▼

&#x20;Normalization

&#x20;       │

&#x20;       ▼

&#x20;   Registry

&#x20;       │

&#x20;       ▼

&#x20;Intelligence

&#x20;       │

&#x20;       ▼

&#x20;  Generation

&#x20;       │

&#x20;       ▼

&#x20; Publication

&#x20;       │

&#x20;       ▼

&#x20;  Applications

```



The output of one stage becomes the input of the next stage.



Each stage has one clear responsibility.



\---



\# Stage 1 — Discovery



The discovery stage identifies information that may need to be processed.



Examples include:



\* New providers

\* New AI models

\* Updated documentation

\* Pricing changes

\* New benchmark results

\* API changes

\* Deprecation notices



The discovery stage only identifies potential updates.



It does not download or modify data.



Output:



A queue of resources for collection.



\---



\# Stage 2 — Collection



Collectors retrieve information from trusted sources.



Possible sources include:



\* Official APIs

\* Official documentation

\* Public model registries

\* Benchmark platforms

\* GitHub repositories

\* Community-maintained datasets



Collectors always preserve the original information.



No transformation happens during collection.



Output:



Raw structured data.



\---



\# Stage 3 — Validation



Collected data must be validated before entering the registry.



Validation includes:



\* Required fields

\* Schema compliance

\* Duplicate detection

\* Identifier validation

\* URL validation

\* Timestamp validation

\* Format verification



Invalid records are rejected.



Warnings may be reported without blocking the pipeline.



Output:



Validated raw data.



\---



\# Stage 4 — Normalization



Different providers represent similar concepts differently.



Normalization converts provider-specific formats into BaseModel's standard schema.



Examples include:



\* Canonical model identifiers

\* Capability names

\* Pricing formats

\* Context window representation

\* API compatibility

\* Provider metadata



Normalization creates consistency across the entire ecosystem.



Output:



Standardized records.



\---



\# Stage 5 — Registry



The registry stores the canonical version of every validated record.



Examples include:



\* Providers

\* Models

\* Capabilities

\* Benchmarks

\* Pricing

\* Metadata



The registry is the single source of truth for BaseModel.



No downstream component should bypass the registry.



Output:



Canonical structured datasets.



\---



\# Stage 6 — Intelligence



The intelligence stage derives additional information from registry data.



Examples include:



\* Rankings

\* Recommendations

\* Benchmark summaries

\* Compatibility reports

\* Provider comparisons

\* Alternative models



This stage never modifies registry data.



It only produces derived intelligence.



Output:



Processed intelligence.



\---



\# Stage 7 — Dataset Generation



Internal datasets are converted into publishable artifacts.



Examples include:



\* models.json

\* providers.json

\* rankings.json

\* recommendations.json

\* benchmarks.json

\* capabilities.json

\* health.json



Generated datasets should be deterministic.



The same registry state should always produce the same output.



Output:



Static datasets.



\---



\# Stage 8 — Publication



Published datasets become available to external consumers.



Primary publication targets include:



\* GitHub Pages

\* Static JSON endpoints

\* SDK packages

\* Downloadable releases



The publication stage never modifies data.



Its responsibility is distribution.



Output:



Public datasets.



\---



\# Consumers



Published datasets are designed to support:



\* AI runtimes

\* AI agents

\* IDE extensions

\* Developer tools

\* Research platforms

\* CLI applications

\* Mobile applications

\* Web applications



Every consumer receives the same standardized data.



\---



\# Pipeline Characteristics



The BaseModel pipeline is designed to be:



\* Deterministic

\* Repeatable

\* Traceable

\* Automated

\* Extensible

\* Provider agnostic



Each stage should be independently testable.



Each stage should produce reproducible outputs.



\---



\# Failure Handling



A failure in one stage should not corrupt downstream data.



Whenever possible:



\* Invalid records are isolated.

\* Successful records continue.

\* Errors are logged.

\* Validation reports are generated.



The registry should never contain partially processed or unverified information.



\---



\# Automation



The pipeline is designed to run automatically through GitHub Actions.



Different stages may execute on different schedules.



Examples:



\* Discovery every few hours

\* Collection daily

\* Benchmarks daily

\* Health checks hourly

\* Publication after successful generation



Automation schedules are implementation details and may evolve over time.



\---



\# Final Statement



The BaseModel pipeline transforms fragmented AI ecosystem information into standardized intelligence through a deterministic sequence of discovery, collection, validation, normalization, registry, intelligence, generation, and publication.



Every published dataset follows the same lifecycle, ensuring consistency, reproducibility, and trust.



