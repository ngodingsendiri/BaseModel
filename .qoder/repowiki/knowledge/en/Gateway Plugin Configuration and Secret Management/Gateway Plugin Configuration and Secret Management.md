---
kind: configuration_system
name: Gateway Plugin Configuration and Secret Management
category: configuration_system
scope:
    - '**'
source_files:
    - packages/collectors/src/core/gateway-secrets.ts
    - packages/collectors/src/core/runner.ts
    - packages/collectors/src/core/plugin-worker.ts
    - packages/collectors/src/core/collector.ts
    - docs/08_Gateway_Plugin_Security.md
    - CONTRIBUTING.md
    - .gitignore
---

BaseModel uses a tightly controlled, process-isolated configuration system for its AI model collectors (gateways). Configuration is not loaded from arbitrary files at runtime; instead, secrets are managed through an explicit allowlist and passed only to isolated worker processes that execute gateway plugins.

**How it works**
- Secrets are declared centrally in `packages/collectors/src/core/gateway-secrets.ts` as a `GATEWAY_SECRET_KEYS` map keyed by provider/gateway ID. Each entry lists the exact environment variable names that may be granted to that gateway's plugin.
- The runner (`packages/collectors/src/core/runner.ts`) builds a filtered environment via `createPluginEnvironment()`, which whitelists only a small set of safe runtime keys (`HOME`, `PATH`, `TEMP`, `TMPDIR`, etc.) plus the approved secret keys for the target gateway. No other `process.env` variables leak into the plugin.
- Plugins run in child processes forked via `node:child_process.fork()` and executed through `plugin-worker.ts`. The worker receives only the pre-approved secret key-value pairs as a plain object — never the full `process.env`.
- For OpenAI-compatible gateways, the runner injects the API key directly as a Bearer token when calling `/models`; custom gateways receive the secrets object as their sole input to `collect(secrets)`.
- A post-execution validation step serializes the plugin result and scans it for any configured secret values, throwing an error if a leak is detected.

**Configuration sources and precedence**
- Environment variables are the sole source of secrets. `.env`, `.env.local`, and `.env.*.local` are explicitly ignored by `.gitignore`, indicating local overrides are expected but must not be committed.
- There is no `.env` file checked in; tests set `process.env.GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, etc., directly.
- Provider metadata (name, organization, website, type) is embedded in `runner.ts` under `PROVIDER_INFO` and used to auto-register providers on first collection.

**Security constraints enforced by code**
- A plugin cannot escalate privileges by declaring its own `secretKeyName`; the runner validates that `plugin.secretKeyName` appears in `getGatewaySecretKeys(plugin.id)` before passing any secret.
- Unregistered gateways receive zero secrets — the test `does not expose CI credentials to an unregistered custom plugin` verifies this.
- Response size is capped (`MAX_PLUGIN_RESPONSE_BYTES = 10MB`) and model count is capped (`MAX_PLUGIN_MODELS = 10_000`) to prevent resource abuse.
- Worker execution is time-boxed to 60 seconds; timeouts kill the child process.
- Error messages sent back to the parent are redacted against active secrets via `redact()`.

**Conventions**
- Adding a new gateway requires two steps: implement the plugin under `packages/collectors/src/gateways/` and register its secret names in `gateway-secrets.ts`. This is documented in `CONTRIBUTING.md` and `docs/08_Gateway_Plugin_Security.md`.
- Gateway plugins must live inside `packages/collectors/src/gateways/` and accept only `.ts` or `.js` extensions.
- The plugin contract is defined in `collector.ts` with two shapes: `SimpleGateway` (OpenAI-compatible `/models` endpoint) and `CustomGateway` (arbitrary `collect()` implementation).
- Model IDs are normalized through `toModelSlug()` and `normalizeModelId()` to produce schema-valid slugs before persistence.