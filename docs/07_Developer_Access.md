# Developer Access & Integration

BaseModel is designed to be easily consumed by external applications (AI runtimes, IDEs, Agents, Dashboards, and SDKs). This document outlines the primary ways to integrate BaseModel into your projects.

## 1. Using the npm SDK

BaseModel publishes its types, schemas, and intelligence logic as npm packages. You can use these in your TypeScript or JavaScript projects.

### Installation

```bash
npm install @basemodel/schema @basemodel/intelligence
```

### Usage: Schemas and Types

You can use the Zod schemas from `@basemodel/schema` to validate data, or use the TypeScript types for your own data structures.

```typescript
import { ModelSchema, type Model } from '@basemodel/schema';

// Validate raw JSON data
const rawData = { /* ... */ };
const parseResult = ModelSchema.safeParse(rawData);

if (parseResult.success) {
  const model: Model = parseResult.data;
  console.log(`Loaded model: ${model.name}`);
}
```

### Usage: Intelligence Engine

If you want to use the ranking, search, and cost efficiency logic in your app, you can use the `@basemodel/intelligence` package. You will need to load the raw JSON datasets from `dist/` and inject them into the engine.

```typescript
import { IntelligenceEngine, searchModels, calculateCostEfficiency } from '@basemodel/intelligence';

// 1. Fetch the raw datasets (e.g. from the BaseModel GitHub Pages or a CDN)
const modelsResponse = await fetch('https://raw.githubusercontent.com/basemodel/basemodel/main/dist/models.json');
const modelsData = await modelsResponse.json();

const pricingResponse = await fetch('https://raw.githubusercontent.com/basemodel/basemodel/main/dist/pricing.json');
const pricingData = await pricingResponse.json();

// 2. Initialize the Engine
const engine = new IntelligenceEngine();
engine.models = modelsData.models;
engine.pricing = pricingData; // Assuming pricing is extracted appropriately
// @ts-expect-error
engine.isLoaded = true; // Mark as manually loaded

// 3. Search for models
const results = searchModels(engine, {
  modalities: ['image'],
  flags: ['vision_support'],
  minContextWindow: 100000
});

console.log(results);

// 4. Calculate cost
const costReport = calculateCostEfficiency(engine, 'openai/gpt-4o');
console.log(costReport.tier); // e.g. "Balanced"
```

## 2. Using the CLI

BaseModel provides a command-line interface for quickly querying the intelligence engine from your terminal.

### Installation

```bash
npm install -g @basemodel/cli
```

### Commands

**Search Models**
Search for models matching specific criteria.
```bash
basemodel search --modality image --flag vision_support --min-context 100000
```

**Model Info**
View detailed information, capabilities, and pricing tier for a specific model.
```bash
basemodel info openai/gpt-4o
```

**Find Alternatives**
Find comparable alternative models that have the same modalities and similar context windows.
```bash
basemodel alternatives anthropic/claude-3-5-sonnet
```

## 3. Direct JSON Consumption

If you are not using JavaScript/TypeScript, the easiest way to consume BaseModel is to fetch the static JSON datasets directly from the `dist/` directory on GitHub.

The datasets are structured according to the canonical Zod schemas, making them easy to parse in Python, Go, Rust, or any other language.

- `models.json`: All active models and their capabilities.
- `providers.json`: Metadata about API providers.
- `intelligence.json`: Derived intelligence (cost tiers, alternative models).

```python
import requests

url = "https://raw.githubusercontent.com/basemodel/basemodel/main/dist/intelligence.json"
response = requests.get(url)
data = response.json()

for record in data["intelligence"]:
    print(f"{record['model_id']} - Tier: {record['cost_tier']}")
```
