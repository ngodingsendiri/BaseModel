# BaseModel

BaseModel is an open-source **AI Model Intelligence Platform**. It continuously discovers, organizes, normalizes, evaluates, and publishes structured knowledge about AI models across the global AI ecosystem.

BaseModel is **not** an AI provider, inference gateway, runtime, or coding assistant. It serves as the intelligence layer that enables developers, runtimes, AI agents, IDEs, research tools, and applications to make informed decisions when selecting and integrating AI models.

## Documentation

Our core documentation serves as the blueprint for this project:

- [Vision](docs/01_Vision.md)
- [Philosophy](docs/02_Philosophy.md)
- [Architecture](docs/03_Architecture.md)
- [Pipeline](docs/04_Pipeline.md)
- [Data Model](docs/05_Data_Model.md)
- [Roadmap](docs/06_Roadmap.md)

## Project Structure

This is a pnpm monorepo containing the following packages:
- `@basemodel/schema` - Canonical Zod schemas and TypeScript types
- `@basemodel/registry` - Validation, normalization, and canonical storage logic
- `@basemodel/collectors` - Provider-specific data collectors
- `@basemodel/intelligence` - Derived insights, rankings, and recommendations
- `@basemodel/publisher` - Dataset generation and distribution

Canonical data is stored in the `data/registry/` directory as version-controlled JSON files.

## Getting Started

```bash
pnpm install
pnpm build
pnpm test
```

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## License

[MIT](LICENSE)
