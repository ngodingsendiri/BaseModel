import { describe, expect, it } from 'vitest';
import { classifyApiModel } from '../core/model-classify';

describe('classifyApiModel', () => {
  it('classifies embedding models', () => {
    const result = classifyApiModel('BAAI/bge-m3');
    expect(result.modality).toEqual(['text', 'embedding']);
    expect(result.embedding_support).toBe(true);
  });

  it('classifies rerankers as embedding models', () => {
    expect(classifyApiModel('jina-reranker-v2').embedding_support).toBe(true);
  });

  it('classifies speech-to-text models', () => {
    const result = classifyApiModel('openai/whisper-large-v3');
    expect(result.modality).toEqual(['audio', 'text']);
    expect(result.audio_support).toBe(true);
  });

  it('classifies text-to-speech models', () => {
    const result = classifyApiModel('sesame/csm-1b');
    expect(result.modality).toEqual(['text', 'audio']);
    expect(result.audio_support).toBe(true);
    expect(classifyApiModel('chatterbox-turbo').audio_support).toBe(true);
  });

  it('classifies image generation models', () => {
    const result = classifyApiModel('black-forest-labs/FLUX.1-dev');
    expect(result.modality).toEqual(['image']);
    expect(result.image_generation).toBe(true);
  });

  it('classifies image-processing tools as image-only, not generators', () => {
    const result = classifyApiModel('Bria/blur_background');
    expect(result.modality).toEqual(['image']);
    expect(result.image_generation).toBe(false);
    expect(result.embedding_support).toBe(false);
  });

  it('classifies video generation models', () => {
    const result = classifyApiModel('nvidia/cosmos3-nano');
    expect(result.modality).toEqual(['video']);
  });

  it('classifies code models', () => {
    const result = classifyApiModel('deepseek/deepseek-coder-v2');
    expect(result.modality).toEqual(['text', 'code']);
  });

  it('flags reasoning models', () => {
    expect(classifyApiModel('deepseek/deepseek-r1').reasoning_support).toBe(true);
    expect(classifyApiModel('claude-opus-4-6-thinking').reasoning_support).toBe(true);
  });

  it('does not flag reasoning for look-alike slugs', () => {
    expect(classifyApiModel('openai/gpt-4o').reasoning_support).toBe(false);
  });

  it('flags vision-capable chat models and adds image modality', () => {
    const result = classifyApiModel('openai/gpt-4o');
    expect(result.vision_support).toBe(true);
    expect(result.modality).toEqual(['text', 'image']);
  });

  it('defaults to a plain text model when nothing matches', () => {
    const result = classifyApiModel('meta-llama/Llama-3.1-8B-Instruct');
    expect(result.modality).toEqual(['text']);
    expect(result.vision_support).toBe(false);
    expect(result.embedding_support).toBe(false);
    expect(result.audio_support).toBe(false);
    expect(result.image_generation).toBe(false);
    expect(result.reasoning_support).toBe(false);
  });
});
