import { describe, expect, it } from 'vitest';
import { parseSearchCriteria } from '../cli';

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
