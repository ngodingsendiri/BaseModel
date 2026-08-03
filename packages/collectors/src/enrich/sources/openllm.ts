import type { Benchmark } from '@basemodel/schema';
import { fetchWithRetry, sleep, slugify } from './lmarena.js';

/**
 * Open LLM Leaderboard — benchmark collection source.
 *
 * Fetches the evaluated-models table from the Hugging Face datasets-server API
 * and normalizes each benchmark column (already on a 0-100 scale) into a
 * canonical Benchmark record. Ranks are recomputed per benchmark after all rows
 * are collected so #1 always points at the best score.
 *
 * Data source: https://huggingface.co/datasets/open-llm-leaderboard/contents
 */

const DATASET = 'open-llm-leaderboard/contents';
const ROWS_API = 'https://datasets-server.huggingface.co/rows';
const PAGE_SIZE = 100;

/** Upper bound on collected rows to keep the nightly job within budget. */
const MAX_ROWS = 5000;

interface OpenLLMRow {
  fullname?: string;
  'Upload To Hub Date'?: string;
  [column: string]: unknown;
}

interface RowsResponse {
  rows: { row: OpenLLMRow }[];
  num_rows_total: number;
}

const BENCHMARKS = [
  { column: 'Average ⬆️', name: 'average', categories: ['overall'] },
  { column: 'IFEval', name: 'ifeval', categories: ['instruction-following'] },
  { column: 'BBH', name: 'bbh', categories: ['reasoning'] },
  { column: 'MATH Lvl 5', name: 'math-lvl-5', categories: ['math'] },
  { column: 'GPQA', name: 'gpqa', categories: ['reasoning'] },
  { column: 'MUSR', name: 'musr', categories: ['reasoning'] },
  { column: 'MMLU-PRO', name: 'mmlu-pro', categories: ['knowledge'] },
];

/** Extracts a YYYY-MM-DD date from any date-ish string, if present. */
export function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1];
}

async function fetchAllRows(accessToken?: string): Promise<OpenLLMRow[]> {
  const rows: OpenLLMRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total && rows.length < MAX_ROWS) {
    const params = new URLSearchParams({
      dataset: DATASET,
      config: 'default',
      split: 'train',
      offset: String(offset),
      length: String(PAGE_SIZE),
    });
    if (accessToken) params.set('access_token', accessToken);

    const response = await fetchWithRetry(`${ROWS_API}?${params.toString()}`, {
      timeoutMs: 30_000,
    });
    if (!response.ok) {
      throw new Error(
        `Open LLM Leaderboard fetch failed: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as RowsResponse;
    total = data.num_rows_total;
    for (const entry of data.rows) {
      rows.push(entry.row);
      if (rows.length >= MAX_ROWS) break;
    }
    offset += PAGE_SIZE;
    // Pace requests: the anonymous datasets-server API rate-limits bursts.
    await sleep(400);
  }

  return rows;
}

/** Builds one provisional record per benchmark column that reports a score. */
function toRecords(row: OpenLLMRow): Benchmark[] {
  const fullname = row.fullname;
  if (typeof fullname !== 'string' || fullname.length === 0) return [];
  const evaluationDate = toIsoDate(row['Upload To Hub Date']);

  const records: Benchmark[] = [];
  for (const benchmark of BENCHMARKS) {
    const value = row[benchmark.column];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    records.push({
      benchmark_id: slugify(`openllm-${benchmark.name}-${fullname}`),
      model_id: fullname,
      benchmark_name: benchmark.name,
      score: Math.max(0, Math.min(100, value)),
      score_raw: value,
      evaluation_date: evaluationDate,
      source: 'openllm',
      category: benchmark.categories,
    });
  }
  return records;
}

/**
 * Collects Open LLM Leaderboard benchmarks.
 *
 * @param accessToken Optional HF datasets-server token for private/higher limits.
 */
export async function enrichOpenLLM(
  accessToken?: string,
): Promise<{ count: number; benchmarks: Benchmark[] }> {
  const rows = await fetchAllRows(accessToken);
  const benchmarks: Benchmark[] = [];
  for (const row of rows) {
    for (const record of toRecords(row)) {
      benchmarks.push(record);
    }
  }

  const byBenchmark = new Map<string, Benchmark[]>();
  for (const record of benchmarks) {
    const list = byBenchmark.get(record.benchmark_name) ?? [];
    list.push(record);
    byBenchmark.set(record.benchmark_name, list);
  }

  let saved = 0;
  for (const list of byBenchmark.values()) {
    const ranked = [...list].sort((a, b) => b.score - a.score);
    ranked.forEach((record, index) => {
      record.rank = index + 1;
    });
    saved += ranked.length;
  }

  console.log(`  openllm: ${rows.length} rows -> ${saved} records`);
  return { count: saved, benchmarks };
}
