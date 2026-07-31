# Developer Access & Integration

BaseModel is designed to be consumed by SDKs, CLIs, agents, dashboards, and
other applications that need structured AI model intelligence.

## 1. npm Packages

The repository publishes four reusable libraries:

- `@basemodel/schema` for canonical schemas and TypeScript types.
- `@basemodel/registry` for reading and writing canonical registry data.
- `@basemodel/intelligence` for search, alternatives, and cost heuristics.
- `@basemodel/publisher` for generating the public JSON datasets.

Install the packages you need:

```bash
npm install @basemodel/schema @basemodel/intelligence
```

### Schemas and Types

```typescript
import { ModelSchema, type Model } from '@basemodel/schema';

const rawData = { /* ... */ };
const parsed = ModelSchema.safeParse(rawData);

if (parsed.success) {
  const model: Model = parsed.data;
  console.log(model.name);
}
```

### Intelligence Engine

`IntelligenceEngine` can load the registry from Node.js or hydrate from an
already loaded snapshot in environments without filesystem access.

```typescript
import { IntelligenceEngine, calculateCostEfficiency, searchModels } from '@basemodel/intelligence';

const engine = new IntelligenceEngine();
await engine.init();

const matches = searchModels(engine, {
  providerIds: ['openai'],
  modalities: ['image'],
  flags: ['vision_support'],
  minContextWindow: 100000,
});

const cost = calculateCostEfficiency(engine, 'openai/gpt-4o');
console.log(cost.tier);
```

In browser-like environments, hydrate the engine manually:

```typescript
engine.hydrate({ models, providers, capabilities, pricing });
```

## 2. CLI

The CLI exposes the same intelligence logic from the terminal.

```bash
basemodel search --provider openai --modality image --flag vision_support --min-context 100000
basemodel info openai/gpt-4o
basemodel alternatives anthropic/claude-3-5-sonnet
```

Supported search filters are:

- `--provider`
- `--modality`
- `--flag`
- `--min-context`

## 3. Direct JSON Consumption

The publisher writes static datasets to `dist/`. Consumers can fetch those
files directly from the repository or from any distribution mirror.

- `models.json` - Models and their capabilities.
- `providers.json` - Provider metadata.
- `capabilities.json` - Canonical capability vocabulary.
- `licenses.json` - License metadata.
- `apis.json` - Model access methods.
- `benchmarks.json` - Benchmark results.
- `pricing.json` - Pricing records.
- `intelligence.json` - Derived cost and alternative data.

```python
import requests

url = 'https://raw.githubusercontent.com/ngodingsendiri/BaseModel/main/dist/intelligence.json'
response = requests.get(url)
data = response.json()

for record in data['intelligence']:
    print(f"{record['model_id']} - {record['cost_tier']}")
```

## 4. Gateway Plugins

Gateway plugins live in `packages/collectors/src/gateways/`. The collector
validates plugin paths, runs plugins in isolated workers, and only injects the
secrets registered for that gateway.

If you add a new plugin, update the secret registry and the security doc at the
same time.
