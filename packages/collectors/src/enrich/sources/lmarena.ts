import { saveBenchmark } from '@basemodel/registry';
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

    const response = await fetch(`${ROWS_API}?${params.toString()}`, {
      signal: AbortSignal.timeout(30_000),
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
      await saveBenchmark(benchmark);
      benchmarks.push(benchmark);
    }
    console.log(`  lmarena/${config}: ${rows.length} rows -> ${benchmarks.length} records`);
  }

  return { count: benchmarks.length, benchmarks };
}
