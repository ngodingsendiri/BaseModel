# BaseModel

BaseModel is an open-source AI model intelligence platform. It discovers,
validates, normalizes, stores, analyzes, and publishes structured knowledge
about AI models.

BaseModel is not an inference runtime, model host, chatbot, coding assistant,
or end-user application. It is the data layer that other systems consume.

## Repository Layout

- `packages/schema` - Canonical Zod schemas and TypeScript types.
- `packages/registry` - Registry storage, validation, and merge utilities.
- `packages/collectors` - Provider and gateway collectors.
- `packages/intelligence` - Derived rankings, search, and recommendations.
- `packages/publisher` - Dataset generation for `dist/`.
- `packages/cli` - Command-line interface for querying intelligence.
- `packages/mcp` - Model Context Protocol server for agent-native access.

Canonical records live in `data/registry/`. Generated datasets are written to
`dist/` and include:

- `providers.json`
- `models.json`
- `capabilities.json`
- `licenses.json`
- `apis.json`
- `benchmarks.json`
- `pricing.json`
- `intelligence.json`
- `v2/models.json`, `v2/offerings.json`, `v2/intelligence.json`,
  `v2/models.csv` — canonical models vs per-provider offerings with
  benchmark quality scores and the Pareto frontier
- `changes.json` — change feed versus the previous snapshot
- `manifest.json` — SHA-256 checksums for snapshot integrity

## Documentation

- [Vision](docs/01_Vision.md)
- [Philosophy](docs/02_Philosophy.md)
- [Architecture](docs/03_Architecture.md)
- [Pipeline](docs/04_Pipeline.md)
- [Data Model](docs/05_Data_Model.md)
- [Roadmap](docs/06_Roadmap.md)
- [Developer Access](docs/07_Developer_Access.md)
- [Gateway Plugin Security](docs/08_Gateway_Plugin_Security.md)
- [Model vs Offering (v2 Data Model)](docs/09_Model_Offering_v2.md)

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm generate
```

Useful package-level commands:

- `pnpm --filter @basemodel/collectors run collect`
- `pnpm --filter @basemodel/collectors run verify packages/collectors/src/gateways/openai.ts`
- `pnpm --filter @basemodel/cli dev -- best --max-cost 2` — best quality per budget
- `pnpm --filter @basemodel/collectors reclassify -- --dry-run` — repair legacy classifications

## License

[MIT](LICENSE)
