import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ModelSchema } from '@basemodel/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFixturePath, getGatewayPluginPath, loadManifest } from '../gateway-gen/manifest.js';
import { fixtureExists } from '../gateway-gen/probe.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI-generated gateway plugins', () => {
  it('map their fixture sample into valid Models without a live API', async () => {
    const manifest = await loadManifest();
    let exercised = 0;

    for (const gateway of manifest.gateways) {
      const pluginPath = getGatewayPluginPath(gateway.id);
      const fixturePath = getFixturePath(gateway.id);
      if (!existsSync(pluginPath) || !fixtureExists(gateway.id)) continue;

      const fixture = JSON.parse(await readFile(fixturePath, 'utf-8')) as unknown;
      const plugin = ((await import(pluginPath)) as { default?: unknown }).default as {
        id?: string;
        collect: (secrets: Record<string, string | undefined>) => Promise<{
          provider_id: string;
          models: Array<Record<string, unknown>>;
          errors: string[];
        }>;
      };
      expect(plugin.id).toBe(gateway.id);

      let fetchCalls = 0;
      const fetchMock = vi.fn(async () => {
        fetchCalls += 1;
        if (fetchCalls > 2) {
          throw new Error('mock: no more pages (pagination guard)');
        }
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const secrets: Record<string, string | undefined> = { ...process.env };
      for (const name of [
        ...gateway.secrets,
        ...(gateway.auth?.secret ? [gateway.auth.secret] : []),
      ]) {
        if (!secrets[name]) secrets[name] = 'test-key';
      }

      const result = await plugin.collect(secrets);
      expect(fetchMock).toHaveBeenCalled();
      expect(result.provider_id).toBe(gateway.id);
      for (const model of result.models) {
        const parsed = ModelSchema.safeParse(model);
        expect(
          parsed.success,
          `${model.model_id ?? '(no model_id)'} invalid: ${parsed.error?.message}`,
        ).toBe(true);
      }
      exercised += 1;
    }

    expect(exercised).toBeGreaterThan(0);
  });
});
