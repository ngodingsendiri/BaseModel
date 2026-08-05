---
kind: build_system
name: pnpm Monorepo Build System
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - tsconfig.json
    - biome.json
---

This repository uses a pnpm-based monorepo build system with TypeScript compilation and Biome for linting/formatting. The build approach is straightforward and centralized through the root package.json scripts.

**System Components:**
- **Package Manager**: pnpm v10.12.1 (enforced via `packageManager` field), workspace configured in `pnpm-workspace.yaml` to include all packages under `packages/*`
- **TypeScript Compiler**: Configured at root `tsconfig.json` with ES2022 target, ESNext modules, bundler resolution, strict mode, and declaration/source map generation to `dist/` directory
- **Code Quality**: Biome v2.5.6 handles both linting and formatting with single quotes, semicolons, trailing commas, and 100-line width
- **Node.js Requirement**: Node >= 20.0.0 enforced via engines field

**Build Scripts:**
The root `package.json` defines workspace-wide commands:
- `build`: Runs `pnpm -r run build` across all packages
- `test`: Runs `pnpm -r run test` across all packages  
- `typecheck`: Runs `pnpm -r run typecheck` across all packages
- `lint`/`lint:fix`: Uses Biome for checking and auto-fixing
- `format`: Formats code with Biome
- `generate`: Runs code generation in the publisher package
- `clean`: Cleans build artifacts across packages

**Architecture:**
- Single root configuration files (`tsconfig.json`, `biome.json`) apply to entire workspace
- Each package under `packages/` manages its own dependencies and build scripts independently
- No Dockerfiles or Makefiles present - pure npm/pnpm-based build pipeline
- No CI/CD workflows found in `.github/workflows/` directory
- Version management appears to be handled per-package rather than centrally

**Conventions:**
- All TypeScript files use strict compiler options including `noUncheckedIndexedAccess`, `noUnusedLocals`, and `verbatimModuleSyntax`
- Source code lives in `src/` directories with outputs going to `dist/`
- JSON files are included in linting but not formatted by Biome
- Workspace pattern follows standard pnpm conventions with glob patterns