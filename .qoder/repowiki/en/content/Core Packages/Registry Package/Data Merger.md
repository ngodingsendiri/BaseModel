# Data Merger

<cite>
**Referenced Files in This Document**
- [merge.ts](file://packages/registry/src/merge.ts)
- [validation.ts](file://packages/registry/src/validation.ts)
- [storage.ts](file://packages/registry/src/storage.ts)
- [index.ts](file://packages/registry/src/index.ts)
- [runner.ts](file://packages/collectors/src/core/runner.ts)
- [slug.ts](file://packages/collectors/src/core/slug.ts)
- [model.ts](file://packages/schema/src/model.ts)
- [merge.test.ts](file://packages/registry/src/__tests__/merge.test.ts)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion

## Introduction
This document explains the data merger system that combines multiple provider data sources into a consistent, curated registry. It covers how incoming collector data is merged with existing records, field-level merge rules, conflict resolution strategies, priority handling, and version management via timestamps. It also provides examples of custom merge strategies, patterns for resolving conflicts, and performance techniques for large datasets.

## Project Structure
The merger spans three packages:
- Schema: defines the canonical Model entity and constraints used by all components.
- Registry: implements merging, validation, storage, and utilities like stamping updated_at.
- Collectors: normalizes upstream model IDs and orchestrates collection, persistence, and lifecycle reconciliation.

```mermaid
graph TB
subgraph "Schema"
M["ModelSchema"]
end
subgraph "Registry"
V["validate()"]
S["storage helpers<br/>read/write/rollup"]
I["index helpers<br/>stampUpdatedAt()"]
MG["mergeModelData()"]
end
subgraph "Collectors"
SL["normalizeModelId()<br/>toModelSlug()"]
R["persistResult()<br/>reconcileLifecycle()"]
end
M --> V
M --> MG
SL --> R
R --> MG
MG --> V
MG --> S
I --> S
```

**Diagram sources**
- [model.ts:11-62](file://packages/schema/src/model.ts#L11-L62)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [storage.ts:48-65](file://packages/registry/src/storage.ts#L48-L65)
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:365-397](file://packages/collectors/src/core/runner.ts#L365-L397)

**Section sources**
- [model.ts:11-62](file://packages/schema/src/model.ts#L11-L62)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [storage.ts:48-65](file://packages/registry/src/storage.ts#L48-L65)
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:365-397](file://packages/collectors/src/core/runner.ts#L365-L397)

## Core Components
- mergeModelData: merges normalized collector data with existing curated records, enforcing curated-field protection and preserving relationships.
- validate: Zod-based validation wrapper returning structured success/errors.
- storage: atomic file writes, directory scanning, rollup writing for benchmarks, and timestamp stamping helper.
- slug normalization: ensures stable, schema-compliant model_id keys across providers.
- runner orchestration: persists results, tracks collisions, reconciles discontinued models, and logs metrics.

Key behaviors:
- Curated fields (description, family, release_date, architecture, parameter_size) are never overwritten by collectors.
- capability_ids and license_id are preserved from existing records.
- Defaults are applied when no existing record exists.
- Validation enforces schema constraints; invalid merges return errors without persisting.

**Section sources**
- [merge.ts:11-17](file://packages/registry/src/merge.ts#L11-L17)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [storage.ts:48-65](file://packages/registry/src/storage.ts#L48-L65)
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:365-397](file://packages/collectors/src/core/runner.ts#L365-L397)

## Architecture Overview
The data flow starts with collectors normalizing upstream IDs, then merging with existing records, validating, and atomically persisting to the registry. A lifecycle reconciliation step marks models as discontinued when they disappear from a provider’s catalog.

```mermaid
sequenceDiagram
participant GW as "Gateway Plugin"
participant COL as "Collector Runner"
participant NRM as "normalizeModelId()"
participant MER as "mergeModelData()"
participant VAL as "validate(ModelSchema)"
participant ST as "storage.writeRegistryFile()"
participant REG as "Registry Files"
GW-->>COL : "CollectionResult(models)"
loop For each partialModel
COL->>NRM : "normalizeModelId(model_id, provider_id)"
NRM-->>COL : "stable model_id"
COL->>MER : "mergeModelData(existing, { ...partialModel, model_id })"
MER->>VAL : "validate(merged)"
VAL-->>MER : "{success, data|errors}"
alt success
MER-->>COL : "{success : true, data}"
COL->>ST : "writeRegistryFile(models/{model_id}.json)"
ST-->>REG : "atomic write"
else failure
MER-->>COL : "{success : false, errors}"
COL-->>COL : "log error and count failed"
end
end
COL->>COL : "reconcileLifecycle(outcomes)"
COL-->>REG : "mark missing models as discontinued"
```

**Diagram sources**
- [runner.ts:365-397](file://packages/collectors/src/core/runner.ts#L365-L397)
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [storage.ts:59-65](file://packages/registry/src/storage.ts#L59-L65)

## Detailed Component Analysis

### Merge Strategy and Field-Level Rules
- Base defaults: When existing is null, defaults are applied for boolean flags, modality array, and status.
- Incoming overwrite: Fields present in incoming override base values unless protected.
- Protected curated fields: description, family, release_date, architecture, parameter_size are never overwritten by incoming data if present in existing.
- Relationship preservation: capability_ids and license_id are preserved from existing even if not present in incoming.
- Validation: final merged object must pass ModelSchema; otherwise, errors are returned.

```mermaid
flowchart TD
Start(["mergeModelData(existing, incoming)"]) --> InitBase["Initialize base:<br/>existing or defaults"]
InitBase --> CopyIncoming["Copy incoming fields over base"]
CopyIncoming --> PreserveRel["Preserve existing capability_ids and license_id"]
PreserveRel --> ProtectCurated["Protect curated fields:<br/>description, family,<br/>release_date, architecture,<br/>parameter_size"]
ProtectCurated --> Validate["Validate against ModelSchema"]
Validate --> Valid{"Valid?"}
Valid --> |Yes| ReturnSuccess["Return { success:true, data }"]
Valid --> |No| ReturnError["Return { success:false, errors }"]
```

**Diagram sources**
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [model.ts:11-62](file://packages/schema/src/model.ts#L11-L62)

**Section sources**
- [merge.ts:11-17](file://packages/registry/src/merge.ts#L11-L17)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [model.ts:11-62](file://packages/schema/src/model.ts#L11-L62)

### ID Normalization and Collision Handling
- normalizeModelId reduces any upstream id to a stable {provider}/{slug} format using toModelSlug, ensuring schema compliance.
- During persistence, collisions where different raw ids map to the same model_id are detected and warned; last write wins.

```mermaid
flowchart TD
In["Raw model_id + provider_id"] --> Slug["toModelSlug(last segment)<br/>lowercase, sanitize chars"]
Slug --> Key["normalizeModelId -> provider/slug"]
Key --> Persist["Persist under stable key"]
Persist --> CheckDup{"Collision?<br/>same key, different raw"}
CheckDup --> |Yes| Warn["Warn 'last write wins'"]
CheckDup --> |No| Done["OK"]
```

**Diagram sources**
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:375-384](file://packages/collectors/src/core/runner.ts#L375-L384)

**Section sources**
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:375-384](file://packages/collectors/src/core/runner.ts#L375-L384)

### Persistence and Atomic Writes
- writeRegistryFile writes to a temporary file and renames it atomically on the same filesystem.
- Benchmarks use a rollup strategy grouping by source to avoid thousands of tiny files while keeping provenance.

```mermaid
flowchart TD
Write["writeRegistryFile(path, data)"] --> MkDir["mkdir recursive"]
MkDir --> Temp["tempPath = path.tmp-{pid}"]
Temp --> W["writeFile(tmp, JSON.stringify(data))"]
W --> Ren["rename(tmp, path)"]
Ren --> Done["Atomic update"]
```

**Diagram sources**
- [storage.ts:59-65](file://packages/registry/src/storage.ts#L59-L65)
- [storage.ts:138-163](file://packages/registry/src/storage.ts#L138-L163)

**Section sources**
- [storage.ts:59-65](file://packages/registry/src/storage.ts#L59-L65)
- [storage.ts:138-163](file://packages/registry/src/storage.ts#L138-L163)

### Version Management and Freshness
- stampUpdatedAt adds an ISO 8601 updated_at timestamp to entities at save time.
- Consumers can detect stale entries by checking presence or value of updated_at.

```mermaid
classDiagram
class Entity {
+object properties
}
class StampedEntity {
+string updated_at
}
Entity <|-- StampedEntity : "extends with timestamp"
```

**Diagram sources**
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)

**Section sources**
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)

### Lifecycle Reconciliation
- After successful collections per provider, models absent from the provider’s current catalog are marked discontinued, preventing accidental deprecation on failures.

```mermaid
flowchart TD
Start(["reconcileLifecycle(outcomes)"]) --> Iterate["For each provider outcome"]
Iterate --> SuccessCheck{"outcome.success?"}
SuccessCheck --> |No| NextProv["Skip provider"]
SuccessCheck --> |Yes| FetchExisting["getModelsByProvider(provider)"]
FetchExisting --> LoopModels["For each model"]
LoopModels --> Seen{"model.model_id in seen set?"}
Seen --> |Yes| Keep["Keep as-is"]
Seen --> |No| StatusCheck{"status already deprecated/discontinued?"}
StatusCheck --> |Yes| Keep
StatusCheck --> |No| MarkDisc["saveModel({ ...model, status:'discontinued' })"]
MarkDisc --> Count["increment deprecatedCount"]
Count --> NextProv
NextProv --> End(["Done"])
```

**Diagram sources**
- [runner.ts:410-426](file://packages/collectors/src/core/runner.ts#L410-L426)

**Section sources**
- [runner.ts:410-426](file://packages/collectors/src/core/runner.ts#L410-L426)

### Custom Merge Strategies and Conflict Resolution Patterns
- Curated vs machine fields: Use curated field protection to keep human-edited metadata safe from automated refreshes.
- Relationship preservation: Always preserve capability_ids and license_id from existing to avoid losing curated relationships.
- Priority handling: Explicitly define which fields come from collectors versus curators; apply defaults only when no prior record exists.
- Example pattern: If you need to merge arrays (e.g., capability_ids), implement a union strategy that preserves both sets and deduplicates before validation.

[No sources needed since this section provides general guidance]

## Dependency Analysis
The merger depends on schema definitions for validation, storage for persistence, and slug normalization for stable keys. The runner orchestrates these pieces and handles lifecycle concerns.

```mermaid
graph LR
Schema["ModelSchema"] --> Merge["mergeModelData"]
Merge --> Validate["validate(ModelSchema)"]
Merge --> Storage["writeRegistryFile / readRegistryFile"]
Runner["persistResult"] --> Normalize["normalizeModelId"]
Runner --> Merge
Runner --> Storage
Index["stampUpdatedAt"] --> Storage
```

**Diagram sources**
- [model.ts:11-62](file://packages/schema/src/model.ts#L11-L62)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [storage.ts:48-65](file://packages/registry/src/storage.ts#L48-L65)
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:365-397](file://packages/collectors/src/core/runner.ts#L365-L397)
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)

**Section sources**
- [model.ts:11-62](file://packages/schema/src/model.ts#L11-L62)
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [storage.ts:48-65](file://packages/registry/src/storage.ts#L48-L65)
- [slug.ts:16-34](file://packages/collectors/src/core/slug.ts#L16-L34)
- [runner.ts:365-397](file://packages/collectors/src/core/runner.ts#L365-L397)
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)

## Performance Considerations
- Atomic writes: Using temp files and rename avoids partial writes and corruption during high-throughput updates.
- Rollups for large datasets: Grouping benchmarks by source reduces file overhead and improves I/O efficiency.
- Batch operations: Reading directories and processing records in loops minimizes repeated filesystem calls.
- Early exits: Skipping invalid or incomplete records prevents unnecessary work and logging noise.
- Idempotent normalization: Stable model_id keys ensure predictable merges and reduce collision risks.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Validation failures: Inspect returned errors from mergeModelData; ensure required fields like model_id are present and conform to schema constraints.
- Curated field overrides: Verify that curated fields are not being unintentionally overwritten; they are protected by design.
- Missing relationships: Ensure capability_ids and license_id are preserved from existing records; do not rely on incoming to supply them.
- Stale data: Check updated_at timestamps to identify records that have not been refreshed recently.
- Collisions: Watch for warnings about different raw ids mapping to the same model_id; confirm expected behavior (“last write wins”).

**Section sources**
- [merge.ts:22-68](file://packages/registry/src/merge.ts#L22-L68)
- [validation.ts:11-20](file://packages/registry/src/validation.ts#L11-L20)
- [runner.ts:375-384](file://packages/collectors/src/core/runner.ts#L375-L384)
- [index.ts:39-41](file://packages/registry/src/index.ts#L39-L41)

## Conclusion
The data merger system provides robust, schema-driven merging with clear priorities between curated and machine-generated fields. It ensures data integrity through validation, atomic persistence, and lifecycle reconciliation. By following the documented merge strategies and leveraging normalization and rollups, teams can maintain high-quality, consistent registry data at scale.