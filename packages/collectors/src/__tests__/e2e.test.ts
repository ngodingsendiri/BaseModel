import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAllGateways } from '../core/runner';

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
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);

    // Should not throw
    await expect(runAllGateways()).resolves.not.toThrow();
  });
});
