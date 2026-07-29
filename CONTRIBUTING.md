# Contributing to BaseModel

Thank you for your interest in contributing to BaseModel! We are building the open, continuously updated intelligence layer for the AI ecosystem.

Please review our core documentation in `docs/` before contributing to understand our architecture and philosophy.

## Development Workflow

### Prerequisites
- Node.js (v20+)
- pnpm (v9+)

### Getting Started
1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build the project: `pnpm build`

### Commands
- `pnpm lint`: Run Biome to check formatting and linting
- `pnpm lint:fix`: Auto-fix formatting and linting issues
- `pnpm typecheck`: Run TypeScript compiler without emitting files
- `pnpm test`: Run tests with Vitest

## Pull Request Guidelines

1. **Keep it small**: Smaller PRs are easier to review.
2. **Follow the schema**: Any changes to data must respect the Zod schemas in `@basemodel/schema`.
3. **Tests**: Add tests for any new logic.
4. **Linting**: Ensure `pnpm lint` and `pnpm typecheck` pass.

## Adding a New Provider or Model

We are currently in the early milestones of development. Please check the `data/registry/` folder structure and ensure any new entries follow the defined schemas.

For automated collectors (Milestone 3+), please see `@basemodel/collectors`.

## Code of Conduct

Please be respectful and constructive in all interactions.
