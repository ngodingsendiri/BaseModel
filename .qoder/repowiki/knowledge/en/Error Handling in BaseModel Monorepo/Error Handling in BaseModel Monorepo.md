---
kind: error_handling
name: Error Handling in BaseModel Monorepo
category: error_handling
scope:
    - '**'
source_files:
    - packages/cli/src/cli.ts
    - packages/collectors/src/core/collector.ts
    - packages/collectors/src/core/plugin-worker.ts
    - packages/collectors/src/core/plugin-path.ts
    - packages/collectors/src/core/runner.ts
---

The BaseModel monorepo uses a layered error handling strategy that varies by package type, with the collectors package having the most sophisticated approach.

## Core Patterns

**CLI Package**: Uses synchronous `console.error()` + `process.exit(1)` for user-facing errors and a single `.catch()` handler at the entry point to surface unhandled promise rejections. Errors are logged as plain strings without structured error types.

**Collectors Package**: Employs a dual approach:
- **Structured error collection**: The `CollectionResult` interface (in `collector.ts`) returns `{ models: Partial<Model>[], errors: string[] }` — non-fatal errors are collected into an array rather than thrown, allowing partial success
- **Fatal validation errors**: Use `throw new Error()` for hard failures like invalid plugin paths, missing required fields, or security violations (secret leakage detection)
- **HTTP error mapping**: A centralized `HTTP_ERROR_HINTS` map provides human-readable guidance for common status codes (401, 403, 404, 412, 429)

**Worker Isolation**: Custom gateway plugins run in isolated child processes via `child_process.fork()`. Worker communication uses a typed response protocol (`WorkerResponse`) with `{ ok: true/false; error?: string }` structure. Errors from workers are redacted to prevent secret leakage before being sent back to the parent process.

## Key Conventions

1. **Non-fatal vs fatal errors**: Validation failures throw exceptions; operational issues (API errors, missing config) return error strings in the `errors` array
2. **Secret sanitization**: All error messages pass through a `redact()` function that replaces configured secret values with `[REDACTED]`
3. **Graceful degradation**: Collection continues even when individual gateways fail, with outcomes tracked per provider
4. **Environment isolation**: Workers only receive whitelisted environment variables plus explicitly approved secrets
5. **Timeout protection**: Plugin execution has a 60-second timeout with explicit error messaging

## Architecture Decisions

- No custom error classes or sentinel errors — uses native `Error` objects and string messages
- No try/catch middleware — error handling is inline where operations occur
- No logging framework — uses `console.log/warn/error` directly
- Tests verify both successful paths and error conditions, particularly around API failures and missing credentials