# Contributing to BaseModel

BaseModel is a data infrastructure project. Changes should improve the
quality, correctness, reproducibility, or usability of the published datasets.

## Before You Start

- Use Node.js 20 or newer.
- Use pnpm 9 or newer.
- Read the docs in `docs/` before changing behavior.

## Setup

```bash
pnpm install
pnpm build
```

## Daily Commands

- `pnpm lint` - Check formatting and static issues.
- `pnpm typecheck` - Run TypeScript checks across the workspace.
- `pnpm test` - Run the workspace test suite.
- `pnpm generate` - Regenerate the published datasets in `dist/`.

## What To Update With Code Changes

- Update the relevant schemas in `packages/schema` when data shape changes.
- Update registry merge or validation logic in `packages/registry` when record
  handling changes.
- Update collectors in `packages/collectors` when provider or gateway inputs
  change.
- Update `packages/publisher` when dataset outputs change.
- Update the docs that describe the changed behavior.

## Pull Requests

- Keep PRs small and focused.
- Add or update tests for behavior changes.
- Do not introduce undocumented fields or outputs.
- Keep examples in sync with current commands and repository paths.

## Adding Providers Or Gateways

New providers or gateways must follow the existing schema contracts.

- Add the collector or gateway under `packages/collectors/src/`.
- Add the required secret names to `packages/collectors/src/core/gateway-secrets.ts`.
- Add tests for the happy path and the failure path.
- Update `docs/07_Developer_Access.md` and `docs/08_Gateway_Plugin_Security.md`
  when the integration surface changes.

## Code Of Conduct

Be respectful, precise, and constructive.
