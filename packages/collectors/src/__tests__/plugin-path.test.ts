import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveGatewayPluginPath } from '../core/plugin-path';

const gatewaysDirectory = path.resolve(__dirname, '..', 'gateways');

describe('Gateway plugin path validation', () => {
  it('accepts a regular TypeScript plugin inside gateways', () => {
    const pluginPath = resolveGatewayPluginPath(
      path.join(gatewaysDirectory, 'anthropic.ts'),
      gatewaysDirectory,
    );
    expect(pluginPath).toBe(path.join(gatewaysDirectory, 'anthropic.ts'));
  });

  it('rejects traversal outside gateways', () => {
    const escapedPath = path.join(gatewaysDirectory, '..', 'core', 'collector.ts');
    expect(() => resolveGatewayPluginPath(escapedPath, gatewaysDirectory)).toThrow(
      'inside the gateways directory',
    );
  });

  it('rejects unsupported plugin extensions', () => {
    expect(() =>
      resolveGatewayPluginPath(
        path.join(gatewaysDirectory, '..', 'package.json'),
        gatewaysDirectory,
      ),
    ).toThrow('must be a .ts or .js file');
  });
});
