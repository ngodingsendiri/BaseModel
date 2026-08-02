import { describe, expect, it } from 'vitest';
import { stampUpdatedAt } from '../index';

describe('stampUpdatedAt', () => {
  it('adds an ISO 8601 updated_at to an entity without mutating it', () => {
    const entity = { model_id: 'openai/gpt-4o', status: 'active' };
    const stamped = stampUpdatedAt(entity);
    expect(stamped.model_id).toBe('openai/gpt-4o');
    expect(stamped.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect('updated_at' in entity).toBe(false);
  });
});
