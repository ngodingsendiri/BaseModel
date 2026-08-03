/**
 * Shared HTTP helpers for collectors and enrichment.
 *
 * All external fetches should go through fetchWithRetry so a transient 429 or
 * 5xx from an upstream API never silently fails a nightly run.
 */

/** Transient HTTP statuses that are safe to retry with backoff. */
export const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Fetches a URL with exponential-ish backoff on transient failures.
 *
 * A fresh timeout signal is created per attempt so an aborted attempt does not
 * poison the retries (AbortSignal.any is available on Node 20.3+).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 3,
  backoffMs = 1000,
  timeoutMs = 15_000,
): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const signal = init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const response = await fetch(url, { ...init, signal });
    if (!RETRYABLE_STATUSES.has(response.status)) return response;
    lastResponse = response;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }
  return lastResponse as Response;
}
