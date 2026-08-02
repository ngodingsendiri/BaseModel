import { describe, expect, it, vi } from 'vitest';

vi.mock('@basemodel/registry', () => ({
  saveBenchmark: vi.fn(),
}));

import { normalizeElo, slugify } from '../enrich/sources/lmarena';
import { toIsoDate } from '../enrich/sources/openllm';

describe('slugify', () => {
  it('lowercases and hyphenates an identifier', () => {
    expect(slugify('GPT-4o')).toBe('gpt-4o');
  });

  it('collapses consecutive separators', () => {
    expect(slugify('Llama  3  8B')).toBe('llama-3-8b');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('---Claude-3.5-Sonnet---')).toBe('claude-3-5-sonnet');
  });

  it('returns an empty string for a non-alphanumeric input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('normalizeElo', () => {
  it('maps the ELO reference band onto 0-100', () => {
    expect(normalizeElo(800)).toBe(0);
    expect(normalizeElo(1600)).toBe(100);
  });

  it('clamps scores below the floor and above the ceiling', () => {
    expect(normalizeElo(0)).toBe(0);
    expect(normalizeElo(2000)).toBe(100);
  });

  it('produces an in-range value for a mid-band rating', () => {
    const score = normalizeElo(1200);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe('toIsoDate', () => {
  it('extracts a YYYY-MM-DD date from a date-time string', () => {
    expect(toIsoDate('2026-07-01T12:00:00Z')).toBe('2026-07-01');
  });

  it('returns the input when already a plain ISO date', () => {
    expect(toIsoDate('2026-07-01')).toBe('2026-07-01');
  });

  it('returns undefined for non-date values', () => {
    expect(toIsoDate(12345)).toBeUndefined();
    expect(toIsoDate('not-a-date')).toBeUndefined();
    expect(toIsoDate(undefined)).toBeUndefined();
  });
});
