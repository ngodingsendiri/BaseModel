---
kind: external_dependency
name: OpenRouter Pricing Catalog
slug: openrouter
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
---

OpenRouter's public `/api/v1/models` endpoint is the primary aggregate pricing source for models that do not declare their own `pricingSource`. When it fails, enrichment falls back to provider-declared catalogs and then Hugging Face; tier propagation from router resellers (requesty, vercel, openrouter) copies only coarse cost tiers, never raw prices.