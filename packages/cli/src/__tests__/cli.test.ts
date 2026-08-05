import { describe, expect, it } from 'vitest';
import { parseBestCriteria, parseSearchCriteria } from '../cli';

describe('parseSearchCriteria', () => {
  it('parses no flags into an empty criteria object', () => {
    expect(parseSearchCriteria([])).toEqual({});
  });

  it('parses a provider flag with comma-separated values', () => {
    expect(parseSearchCriteria(['--provider', 'openai,anthropic'])).toEqual({
      providerIds: ['openai', 'anthropic'],
    });
  });

  it('parses modality and flag options', () => {
    expect(parseSearchCriteria(['--modality', 'image', '--flag', 'vision_support'])).toEqual({
      modalities: ['image'],
      flags: ['vision_support'],
    });
  });

  it('parses a numeric min-context option', () => {
    expect(parseSearchCriteria(['--min-context', '128000'])).toEqual({
      minContextWindow: 128000,
    });
  });

  it('ignores an option missing its value', () => {
    expect(parseSearchCriteria(['--provider'])).toEqual({});
  });

  it('ignores unknown flags', () => {
    expect(parseSearchCriteria(['--bogus', 'value'])).toEqual({});
  });

  it('parses a positional free-text query', () => {
    expect(parseSearchCriteria(['gpt-4o'])).toEqual({ query: 'gpt-4o' });
  });

  it('parses query together with flags and limit', () => {
    expect(parseSearchCriteria(['claude', '--provider', 'anthropic', '--limit', '5'])).toEqual({
      query: 'claude',
      providerIds: ['anthropic'],
      limit: 5,
    });
  });

  it('keeps only the first bare argument as the query', () => {
    expect(parseSearchCriteria(['gpt', '4o'])).toEqual({ query: 'gpt' });
  });

  it('handles mixed options in sequence', () => {
    expect(
      parseSearchCriteria([
        '--provider',
        'meta',
        '--modality',
        'text,image',
        '--min-context',
        '8192',
      ]),
    ).toEqual({
      providerIds: ['meta'],
      modalities: ['text', 'image'],
      minContextWindow: 8192,
    });
  });
});

describe('parseBestCriteria', () => {
  it('parses no flags into an empty criteria object', () => {
    expect(parseBestCriteria([])).toEqual({});
  });

  it('parses category, budget, context, and limit options', () => {
    expect(
      parseBestCriteria([
        '--category',
        'coding',
        '--max-cost',
        '1.5',
        '--min-context',
        '32000',
        '--limit',
        '3',
      ]),
    ).toEqual({
      category: 'coding',
      maxCost: 1.5,
      minContextWindow: 32000,
      limit: 3,
    });
  });

  it('ignores unknown flags and missing values', () => {
    expect(parseBestCriteria(['--bogus', 'x', '--max-cost'])).toEqual({});
  });
});
