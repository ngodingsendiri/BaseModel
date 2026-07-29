import { describe, it, expect } from 'vitest';
import { mergeModelData } from '../merge';
import type { Model } from '@basemodel/schema';

describe('mergeModelData', () => {
  it('creates a new model with defaults when existing is null', () => {
    const incoming: Partial<Model> = {
      model_id: 'openai/new-model',
      provider_id: 'openai',
      name: 'New Model',
      context_window: 8000,
    };

    const result = mergeModelData(null, incoming);
    
    expect(result.success).toBe(true);
    const data = result.data as Model;
    expect(data.model_id).toBe('openai/new-model');
    expect(data.open_weight).toBe(false); // Default applied
    expect(data.modality).toEqual(['text']); // Default applied
    expect(data.status).toBe('active'); // Default applied
  });

  it('merges incoming over existing for primitive fields', () => {
    const existing: Partial<Model> = {
      model_id: 'openai/gpt-4o',
      provider_id: 'openai',
      name: 'Old Name',
      context_window: 1000,
      open_weight: true, // manual flag
      reasoning_support: false,
      function_calling: false,
      structured_output: false,
      vision_support: false,
      audio_support: false,
      image_generation: false,
      embedding_support: false,
      modality: ['text'],
      status: 'active',
    };

    const incoming: Partial<Model> = {
      model_id: 'openai/gpt-4o',
      provider_id: 'openai',
      name: 'GPT-4o', // updated
      context_window: 128000, // updated
      status: 'active',
    };

    const result = mergeModelData(existing, incoming);
    expect(result.success).toBe(true);
    
    const data = result.data as Model;
    expect(data.name).toBe('GPT-4o');
    expect(data.context_window).toBe(128000);
    // Preserved manual flag
    expect(data.open_weight).toBe(true); 
  });

  it('preserves existing capability_ids and license_id', () => {
    const existing: Partial<Model> = {
      model_id: 'openai/gpt-4o',
      provider_id: 'openai',
      name: 'GPT-4o',
      open_weight: false,
      reasoning_support: false,
      function_calling: true,
      structured_output: true,
      vision_support: true,
      audio_support: false,
      image_generation: false,
      embedding_support: false,
      modality: ['text', 'image'],
      status: 'active',
      capability_ids: ['cap-1', 'cap-2'],
      license_id: 'mit',
    };

    const incoming: Partial<Model> = {
      model_id: 'openai/gpt-4o',
      provider_id: 'openai',
      name: 'GPT-4o',
      status: 'active',
    };

    const result = mergeModelData(existing, incoming);
    expect(result.success).toBe(true);
    
    const data = result.data as Model;
    expect(data.capability_ids).toEqual(['cap-1', 'cap-2']);
    expect(data.license_id).toBe('mit');
  });

  it('fails validation if required fields are missing completely', () => {
    const incoming: Partial<Model> = {
      // Missing model_id
      provider_id: 'openai',
      name: 'New Model',
    };

    const result = mergeModelData(null, incoming);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('model_id');
  });
});
