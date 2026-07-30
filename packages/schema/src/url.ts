import { z } from 'zod';

/** Public URLs must be fetchable web URLs, never executable or local schemes. */
export const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL must use the http or https scheme');
