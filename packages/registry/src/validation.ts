import { ZodSchema, ZodError } from 'zod';

/**
 * The result of a validation attempt — a proper discriminated union
 * so TypeScript can narrow the type based on `success`.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/**
 * Validates a raw unknown value against a Zod schema.
 * Returns a typed ValidationResult — never throws.
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
 * Validates an array of records against a schema.
 * Returns both the valid records and a list of errors for failed ones.
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
