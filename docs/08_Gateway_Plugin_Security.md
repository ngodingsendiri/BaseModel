# Gateway Plugin Security

Gateway plugins are executable code. BaseModel treats them as untrusted until
their source, path, and secret requirements are reviewed.

## Current Boundary

- Plugin files must resolve inside `packages/collectors/src/gateways/`.
- Only `.ts` and `.js` gateway files are accepted.
- The verifier loads plugin metadata in an isolated worker first.
- Custom collection runs in a second worker with only approved secrets.
- Secrets must be registered in `packages/collectors/src/core/gateway-secrets.ts`.
- `GITHUB_TOKEN` and other CI credentials are not passed through to plugins.

The plugin's `secretKeyName` field remains for compatibility, but it does not
grant access to a secret by itself. A new or changed secret must be reviewed in
the central secret registry.

## Adding A Gateway

1. Implement the plugin contract in `packages/collectors/src/gateways/`.
2. Add the required secret names to `gateway-secrets.ts`.
3. Add tests that cover success and failure cases.
4. Review the plugin and its secret requirements together.

An unregistered gateway receives no secrets. A plugin file must not be able to
escalate its own privileges by declaring a new secret name.

## Remaining Risk

Process isolation reduces exposure, but it is not an operating-system sandbox.
A reviewed plugin can still use its explicitly granted API key, access the
checked-out working tree, and make network requests. Long term, third-party
plugins should run in a container or restricted runner with read-only source
checkout and an egress allowlist.
