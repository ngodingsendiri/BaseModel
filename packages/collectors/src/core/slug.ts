/**
 * Model-id slug normalization shared by collectors and enrichment.
 *
 * OpenAI-compatible `/models` endpoints (and the OpenRouter catalog) may
 * return ids that are prefixed with an organization (e.g. "sesame/csm-1b"),
 * carry route suffixes (e.g. "gpt-4o:free"), or include community markers
 * (e.g. "~openai/gpt-4o"), none of which are valid in a `{provider}/{slug}`
 * model_id. All of these are reduced here to a schema-safe slug.
 */

/**
 * Normalizes a raw API model id into a schema-valid model slug.
 * Takes the last path segment and keeps only the characters allowed by the
 * ModelSchema slug regex.
 */
export function toModelSlug(apiId: string): string {
  const lastSegment = (apiId.split('/').pop() ?? apiId).toLowerCase();
  const slug = lastSegment
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'model';
}

/**
 * Guarantees every persisted model uses a schema-valid `{provider}/{slug}`
 * model_id. Custom gateways may emit org-prefixed or routed ids (e.g.
 * "vercel/openai/gpt-4o"), so we re-key the id against the provider that
 * actually reported the model. Idempotent for already-valid ids.
 */
export function normalizeModelId(modelId: string, providerId: string): string {
  const slug = toModelSlug(modelId.split('/').pop() ?? modelId);
  return `${providerId}/${slug}`;
}
