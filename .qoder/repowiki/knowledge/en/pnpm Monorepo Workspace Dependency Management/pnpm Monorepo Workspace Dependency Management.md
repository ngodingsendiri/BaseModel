---
kind: dependency_management
name: pnpm Monorepo Workspace Dependency Management
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - .pnpm-store/v11/index.db
    - packages/cli/package.json
    - packages/schema/package.json
    - packages/registry/package.json
    - packages/intelligence/package.json
    - packages/publisher/package.json
---

This repository uses a pnpm-based monorepo workspace for dependency management across multiple TypeScript packages. The system is built around a single root `package.json` that orchestrates shared tooling and a `pnpm-workspace.yaml` configuration that discovers all packages under the `packages/*` directory pattern.

**System and Tools:**
- Package manager: pnpm (version pinned to `10.12.1` via `packageManager` field)
- Node.js engine requirement: `>=20.0.0`
- Lockfile: `pnpm-lock.yaml` with lockfileVersion `9.0`, committed to version control
- Store location: `.pnpm-store/v11/` for global package caching
- No vendoring — dependencies are installed from npm registry into node_modules per-package

**Workspace Structure:**
The monorepo contains five packages, each with its own `package.json`:
- `@basemodel/cli` — CLI entrypoint depending on intelligence, registry, and schema
- `@basemodel/collectors` — data collection layer
- `@basemodel/intelligence` — rankings and insights, depends on schema and registry
- `@basemodel/publisher` — dataset generation, depends on schema, registry, and intelligence
- `@basemodel/registry` — validation and storage, depends on schema
- `@basemodel/schema` — foundational Zod schemas, no internal workspace dependencies

**Internal Dependencies Pattern:**
All inter-package dependencies use the `workspace:*` protocol (e.g., `"@basemodel/schema": "workspace:*"`), which creates symlinked links in the lockfile (`link:../schema`). This ensures all packages always resolve to the local development versions rather than published versions.

**External Dependencies Strategy:**
- Shared dev dependencies (TypeScript, tsup, vitest, rimraf, @types/node) are declared consistently across packages using caret ranges (`^5.8.0`, `^3.2.0`, etc.)
- Runtime dependencies are minimal: only `zod` (`^3.24.4`) is used as an external runtime dependency across schema, registry, and collectors packages
- Root-level dev dependency: `@biomejs/biome` for linting/formatting

**Build and Tooling Conventions:**
- All packages use `tsup` for building ESM output with TypeScript declaration files
- TypeScript is uniformly set to `type: "module"` across packages
- Each package declares `dist/` in its `files` array for published artifacts
- Root scripts delegate to workspaces via `pnpm -r run <script>` or `pnpm --filter <pkg> run <script>`

**Constraints and Enforcement:**
- The `engines` field enforces minimum Node.js and pnpm versions
- The `packageManager` field pins the exact pnpm version for reproducible installs
- Private packages (`@basemodel/registry`, `@basemodel/publisher`) are marked `private: true` to prevent accidental publishing
- No private registry or authentication configuration is present — all packages resolve from the public npm registry