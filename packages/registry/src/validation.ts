import type { ZodError, ZodSchema } from 'zod';

/**
 * Validation result returned by the registry helpers.
 */
export type ValidationResult<T> = { success: true; data: T } | { success: false; errors: string[] };

/**
 * Validates a raw value against a Zod schema without throwing.
 */
export function validate<T>(schema: ZodSchema<T>, raw: unknown): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = (result.error as ZodError).errors.map(
    (e: { path: (string | number)[]; message: string }) => `${e.path.join('.')}: ${e.message}`,
  );
  return { success: false, errors };
}

/**
 * Validates a list of records against a schema and collects row-level errors.
 */
export function validateMany<T>(
  schema: ZodSchema<T>,
  records: unknown[],
): { valid: T[]; invalid: { index: number; errors: string[] }[] } {
  const valid: T[] = [];
  const invalid: { index: number; errors: string[] }[] = [];

  for (let i = 0; i < records.length; i++) {
    const result = validate(schema, records[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({ index: i, errors: result.errors });
    }
  }

  return { valid, invalid };
}
