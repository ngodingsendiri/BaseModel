import type { Model, Pricing } from '@basemodel/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { IntelligenceEngine } from '../core/engine';
import { findAlternatives } from '../features/alternatives';
import { calculateCostEfficiency } from '../features/cost';
import { searchModels } from '../features/search';

describe('Intelligence Layer', () => {
  let engine: IntelligenceEngine;

  beforeEach(() => {
    engine = new IntelligenceEngine();

    // Mock the loaded data
    const gpt4o: Model = {
      model_id: 'openai/gpt-4o',
      provider_id: 'openai',
      name: 'GPT-4o',
      status: 'active',
      modality: ['text', 'image'],
      context_window: 128000,
      open_weight: false,
      reasoning_support: false,
      function_calling: true,
      structured_output: true,
      vision_support: true,
      audio_support: false,
      image_generation: false,
      embedding_support: false,
      capability_ids: [],
    };

    const claude: Model = {
      model_id: 'anthropic/claude-3-5-sonnet',
      provider_id: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      status: 'active',
      modality: ['text', 'image'],
      context_window: 200000,
      open_weight: false,
      reasoning_support: false,
      function_calling: true,
      structured_output: false,
      vision_support: true,
      audio_support: false,
      image_generation: false,
      embedding_support: false,
      capability_ids: [],
    };

    const llama: Model = {
      model_id: 'meta/llama-3-8b',
      provider_id: 'meta',
      name: 'Llama 3 8B',
      status: 'active',
      modality: ['text'],
      context_window: 8192,
      open_weight: true,
      reasoning_support: false,
      function_calling: false,
      structured_output: false,
      vision_support: false,
      audio_support: false,
      image_generation: false,
      embedding_support: false,
      capability_ids: [],
    };

    engine.models = [gpt4o, claude, llama];

    const pricing1: Pricing = {
      pricing_id: 'gpt-4o-in',
      model_id: 'openai/gpt-4o',
      pricing_type: 'input-token',
      unit: '1M tokens',
      value: 5.0,
      currency: 'USD',
    };
    const pricing2: Pricing = {
      pricing_id: 'gpt-4o-out',
      model_id: 'openai/gpt-4o',
      pricing_type: 'output-token',
      unit: '1M tokens',
      value: 15.0,
      currency: 'USD',
    };

    engine.pricing = [pricing1, pricing2];

    // Simulate init (isLoaded is public)
    engine.isLoaded = true;
  });

  describe('Search', () => {
    it('filters by provider and flag', () => {
      const results = searchModels(engine, {
        providerIds: ['meta'],
        flags: ['open_weight'],
      });
      expect(results).toHaveLength(1);
      const first = results[0];
      expect(first?.model_id).toBe('meta/llama-3-8b');
    });

    it('filters by modality and context window', () => {
      const results = searchModels(engine, {
        modalities: ['image'],
        minContextWindow: 150000,
      });
      expect(results).toHaveLength(1);
      const first = results[0];
      expect(first?.model_id).toBe('anthropic/claude-3-5-sonnet');
    });
  });

  describe('Cost Efficiency', () => {
    it('calculates blended cost correctly', () => {
      const report = calculateCostEfficiency(engine, 'openai/gpt-4o');
      // input 5.0 * 3 = 15.0
      // output 15.0 * 1 = 15.0
      // (15.0 + 15.0) / 4 = 7.5
      expect(report.blendedCost).toBe(7.5);
      expect(report.tier).toBe('Premium');
    });

    it('returns Unknown for missing pricing', () => {
      const report = calculateCostEfficiency(engine, 'meta/llama-3-8b');
      expect(report.tier).toBe('Unknown');
    });
  });

  describe('Alternatives', () => {
    it('finds alternatives based on modalities and function calling', () => {
      const alts = findAlternatives(engine, 'openai/gpt-4o');

      // GPT-4o has text, image and function calling
      // Claude has text, image and function calling
      // Llama only has text, no function calling
      expect(alts).toHaveLength(1);
      const firstAlt = alts[0];
      expect(firstAlt?.model.model_id).toBe('anthropic/claude-3-5-sonnet');
      expect(firstAlt?.reason).toContain(
        'Cross-provider alternative from anthropic with larger context window (200000)',
      );
    });

    it('does not treat an unknown context window as compatible', () => {
      const original = engine.models[0];
      const candidate = engine.models[1];
      if (!original || !candidate) throw new Error('Test fixture is incomplete');
      engine.models = [
        original,
        {
          ...candidate,
          model_id: 'anthropic/unknown-context',
          context_window: undefined,
        },
      ];

      expect(findAlternatives(engine, original.model_id)).toEqual([]);
    });
  });

  describe('Snapshot hydration', () => {
    it('rejects invalid runtime data', () => {
      expect(() =>
        engine.hydrate({ models: [{}] as Model[], providers: [], capabilities: [], pricing: [] }),
      ).toThrow('Invalid intelligence snapshot');
    });

    it('copies snapshot arrays instead of retaining caller references', () => {
      const snapshot = {
        models: [engine.models[0] as Model],
        providers: [],
        capabilities: [],
        pricing: [],
      };
      engine.hydrate(snapshot);
      snapshot.models.length = 0;
      expect(engine.models).toHaveLength(1);
    });
  });
});
