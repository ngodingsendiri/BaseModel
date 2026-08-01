import { describe, expect, it } from 'vitest';
import { loadManifest } from '../manifest.js';
import { extractShape } from '../probe.js';

describe('extractShape', () => {
  it('detects a model array with id/name keys', () => {
    const raw = {
      models: [
        { name: 'command-r-plus', endpoints: ['chat', 'embed'], context_length: 128000 },
        { name: 'embed-english-v3.0', endpoints: ['embed'] },
      ],
    };
    const shape = extractShape(raw);
    expect(shape.topLevel).toEqual({ models: 'array[2]' });
    expect(shape.modelArray).not.toBeNull();
    expect(shape.modelArray?.path).toBe('$.models');
    expect(shape.modelArray?.count).toBe(2);
    expect(shape.modelArray?.keys).toEqual(['name', 'endpoints', 'context_length']);
  });

  it('returns null modelArray when no object with id/name exists', () => {
    const shape = extractShape({ status: 'ok', total: 0, items: [1, 2, 3] });
    expect(shape.modelArray).toBeNull();
    expect(shape.topLevel).toEqual({ status: 'string', total: 'number', items: 'array[3]' });
  });

  it('picks the largest array of model-like objects', () => {
    const raw = {
      small: [{ id: 'a' }],
      big: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
    };
    const shape = extractShape(raw);
    expect(shape.modelArray?.path).toBe('$.big');
    expect(shape.modelArray?.count).toBe(3);
  });
});

describe('manifest', () => {
  it('loads and contains the example cohere gateway', async () => {
    const manifest = await loadManifest();
    expect(manifest.version).toBe(1);
    const cohere = manifest.gateways.find((gateway) => gateway.id === 'cohere');
    expect(cohere).toBeDefined();
    expect(cohere?.baseUrl).toBe('https://api.cohere.com');
    expect(cohere?.auth?.secret).toBe('COHERE_API_KEY');
  });
});
