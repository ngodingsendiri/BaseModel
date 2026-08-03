import type { Benchmark } from '@basemodel/schema';

/**
 * LMArena — leaderboard collection source.
 *
 * Fetches the latest snapshot of the LMArena (formerly Chatbot Arena)
 * leaderboards from the Hugging Face datasets-server API and normalizes each
 * row into a canonical Benchmark record.
 *
 * Data source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
 */

const DATASET = 'lmarena-ai/leaderboard-dataset';
const ROWS_API = 'https://datasets-server.huggingface.co/rows';
const PAGE_SIZE = 100;

/** Which arena configs to collect. `text` drives most ranking categories. */
const ARENA_CONFIGS = ['text', 'webdev', 'vision'] as const;

/**
 * Elo/Bradley-Terry ratings live on a ~700-1600 scale. Map that onto the
 * canonical 0-100 score range using a fixed reference band so scores are
 * comparable across configs and runs.
 */
const ELO_FLOOR = 800;
const ELO_CEILING = 1600;

interface LMArenaRow {
  model_name: string;
  organization: string;
  rating: number;
  rank: number;
  category: string;
  leaderboard_publish_date: string;
}

interface RowsResponse {
  rows: { row: LMArenaRow }[];
  num_rows_total: number;
}

/** Reduces an arbitrary identifier to a safe, stable filename slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Maps an Elo-style rating onto the canonical 0-100 range. */
/**
 * Fetches a URL with exponential backoff on transient failures. The HF
 * datasets-server API aggressively rate-limits anonymous clients (HTTP 429),
 * which previously failed an entire nightly benchmark run on the first burst.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const maxRetries = options.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (response.ok || attempt >= maxRetries) return response;
    if (response.status === 429 || response.status >= 500) {
      const delay = Math.min(60_000, 2 ** attempt * 3_000) + Math.random() * 1_000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    return response;
  }
}

export function normalizeElo(rating: number): number {
  const score = ((rating - ELO_FLOOR) / (ELO_CEILING - ELO_FLOOR)) * 100;
  return Math.max(0, Math.min(100, score));
}

/** Paginates every row of a config/split from the datasets-server API. */
async function fetchAllRows(config: string, accessToken?: string): Promise<LMArenaRow[]> {
  const rows: LMArenaRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const params = new URLSearchParams({
      dataset: DATASET,
      config,
      split: 'latest',
      offset: String(offset),
      length: String(PAGE_SIZE),
    });
    if (accessToken) params.set('access_token', accessToken);

    const response = await fetchWithRetry(`${ROWS_API}?${params.toString()}`, {
      timeoutMs: 30_000,
    });
    if (!response.ok) {
      throw new Error(
        `LMArena fetch failed: HTTP ${response.status} ${response.statusText} (${config})`,
      );
    }

    const data = (await response.json()) as RowsResponse;
    total = data.num_rows_total;
    for (const entry of data.rows) {
      rows.push(entry.row);
    }
    offset += PAGE_SIZE;
    // Pace requests: the anonymous datasets-server API rate-limits bursts.
    await sleep(400);
  }

  return rows;
}

function toBenchmark(config: string, row: LMArenaRow): Benchmark {
  return {
    benchmark_id: slugify(`lmarena-${config}-${row.category}-${row.model_name}`),
    model_id: row.model_name,
    benchmark_name: row.category,
    version: config,
    score: normalizeElo(row.rating),
    score_raw: row.rating,
    evaluation_date: row.leaderboard_publish_date,
    source: 'lmarena',
    category: [config],
    rank: row.rank,
  };
}

/**
 * Collects LMArena benchmarks for the configured arenas.
 *
 * @param accessToken Optional HF datasets-server token for private/higher limits.
 */
export async function enrichBM(
  accessToken?: string,
): Promise<{ count: number; benchmarks: Benchmark[] }> {
  const benchmarks: Benchmark[] = [];

  for (const config of ARENA_CONFIGS) {
    const rows = await fetchAllRows(config, accessToken);
    for (const row of rows) {
      if (!row.model_name || !Number.isFinite(row.rating)) continue;
      const benchmark = toBenchmark(config, row);
      benchmarks.push(benchmark);
    }
    console.log(`  lmarena/${config}: ${rows.length} rows -> ${benchmarks.length} records`);
  }

  return { count: benchmarks.length, benchmarks };
}
