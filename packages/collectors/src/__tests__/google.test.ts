import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import googleGateway from '../gateways/google';

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('google gateway', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if GOOGLE_AI_API_KEY is not set', async () => {
    const result = await googleGateway.collect({});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('GOOGLE_AI_API_KEY is required');
  });

  it('parses Gemini model list and normalizes fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            description: 'Fast multimodal model',
            inputTokenLimit: 1048576,
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/text-embedding-004',
            displayName: 'Text Embedding',
            inputTokenLimit: 2048,
            supportedGenerationMethods: ['embedContent'],
          },
          {
            name: 'models/imagen-3.0-generate-002',
            displayName: 'Imagen 3',
            inputTokenLimit: 0,
            supportedGenerationMethods: ['imageGeneration'],
          },
        ],
      }),
    });

    const result = await googleGateway.collect({ GOOGLE_AI_API_KEY: 'test-key' });
    expect(result.errors).toHaveLength(0);
    expect(result.models).toHaveLength(3);

    const flash = result.models.find((m) => m.model_id === 'google/gemini-2.5-flash');
    expect(flash).toMatchObject({
      provider_id: 'google',
      name: 'Gemini 2.5 Flash',
      context_window: 1048576,
      vision_support: true,
      audio_support: true,
      modality: ['text', 'image', 'audio', 'video'],
    });

    const embedding = result.models.find((m) => m.model_id === 'google/text-embedding-004');
    expect(embedding).toMatchObject({ embedding_support: true, vision_support: false });

    const imagen = result.models.find((m) => m.model_id === 'google/imagen-3.0-generate-002');
    expect(imagen).toMatchObject({ image_generation: true, modality: ['text', 'image'] });
  });

  it('reports HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const result = await googleGateway.collect({ GOOGLE_AI_API_KEY: 'bad-key' });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('HTTP 403');
  });
});
