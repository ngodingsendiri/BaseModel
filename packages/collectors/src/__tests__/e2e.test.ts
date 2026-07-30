import fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGatewaySecretKeys } from '../core/gateway-secrets';
import {
  createPluginEnvironment,
  describeGatewayPlugin,
  executeGatewayPlugin,
  runAllGateways,
} from '../core/runner';

// Mock dependencies to prevent actual HTTP requests and file writing
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readdirSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
  };
});

vi.mock('@basemodel/registry', () => ({
  getModel: vi.fn().mockResolvedValue(null),
  mergeModelData: vi.fn().mockReturnValue({ success: true, data: {} }),
  saveModel: vi.fn().mockResolvedValue(true),
}));

describe('Collector E2E Pipeline', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gracefully handles missing gateways directory', async () => {
    // Mock existsSync to return false
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Should not throw, should just warn and exit
    await expect(runAllGateways()).resolves.not.toThrow();
  });

  it('gracefully handles empty gateways directory', async () => {
    // Mock existsSync to return true
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Mock readdirSync to return empty
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);

    // Should not throw
    await expect(runAllGateways()).resolves.not.toThrow();
  });

  it('passes only centrally approved secrets to a plugin worker', () => {
    const environment = createPluginEnvironment(['OPENAI_API_KEY'], {
      PATH: 'safe-path',
      OPENAI_API_KEY: 'approved-secret',
      ANTHROPIC_API_KEY: 'unapproved-secret',
      GITHUB_TOKEN: 'ci-token',
    });

    expect(environment).toEqual({ PATH: 'safe-path', OPENAI_API_KEY: 'approved-secret' });
    expect(getGatewaySecretKeys('openai')).toEqual(['OPENAI_API_KEY']);
    expect(getGatewaySecretKeys('unregistered-gateway')).toEqual([]);
  });

  it('does not expose CI credentials to an unregistered custom plugin', async () => {
    process.env.GITHUB_TOKEN = 'must-not-reach-plugin';
    const pluginPath = join(__dirname, 'fixtures', 'unregistered-gateway.ts');
    const plugin = await describeGatewayPlugin(pluginPath);
    const result = await executeGatewayPlugin(pluginPath, plugin);

    expect(result.errors).toEqual(['GITHUB_TOKEN=absent', 'injected=absent']);
  });

  it('rejects a plugin result containing an approved secret', async () => {
    process.env.ANTHROPIC_API_KEY = 'approved-but-private';
    const pluginPath = join(__dirname, 'fixtures', 'secret-leak-gateway.ts');
    const plugin = await describeGatewayPlugin(pluginPath);

    await expect(executeGatewayPlugin(pluginPath, plugin)).rejects.toThrow(
      'Plugin result contains a configured secret',
    );
  });
});
