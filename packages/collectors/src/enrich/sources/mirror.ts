import type { Benchmark } from '@basemodel/schema';
import { normalizeElo, slugify } from './lmarena.js';

/**
 * Mirror — fallback benchmark source.
 *
 * Consumes the daily GitHub raw snapshots of the Arena leaderboards. Used only
 * when the primary LMArena source is unreachable, so the pipeline still emits
 * ranked text/code benchmarks on a degraded path.
 *
 * Data source: https://github.com/oolong-tea-2026/arena-ai-leaderboards
 */

const RAW_BASE =
  'https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main/data';
const LEADERBOARDS = ['text', 'code'] as const;

interface MirrorRow {
  rank?: number;
  model: string;
  vendor?: string | null;
  license?: string | null;
  score?: number | null;
  ci?: number | null;
  votes?: number | null;
}

interface MirrorFile {
  meta: {
    leaderboard: string;
    fetched_at?: string;
  };
  models: MirrorRow[];
}

/** Resolves the newest snapshot date from data/latest.json. */
async function resolveLatestDate(): Promise<string> {
  const response = await fetch(`${RAW_BASE}/latest.json`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Mirror latest.json fetch failed: HTTP ${response.status}`);
  }
  const latest = (await response.json()) as unknown;
  if (typeof latest === 'string') return latest;
  const record = latest as { date?: unknown; path?: unknown };
  const date =
    typeof record.date === 'string'
      ? record.date
      : typeof record.path === 'string'
        ? record.path
        : undefined;
  if (!date) throw new Error('Mirror latest.json did not contain a date/path field');
  return date;
}

async function fetchLeaderboard(date: string, name: string): Promise<MirrorFile> {
  const response = await fetch(`${RAW_BASE}/${date}/${name}.json`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Mirror ${name}.json fetch failed: HTTP ${response.status}`);
  }
  return (await response.json()) as MirrorFile;
}

/**
 * Collects benchmarks from the latest Mirror snapshot.
 *
 * @param date Optional snapshot date override (defaults to data/latest.json).
 */
export async function enrichMirror(
  date?: string,
): Promise<{ count: number; benchmarks: Benchmark[] }> {
  const snapshotDate = date ?? (await resolveLatestDate());
  const benchmarks: Benchmark[] = [];

  for (const name of LEADERBOARDS) {
    const file = await fetchLeaderboard(snapshotDate, name);
    const fetchedAt = file.meta.fetched_at?.slice(0, 10);
    for (const row of file.models) {
      if (!row.model || typeof row.score !== 'number' || !Number.isFinite(row.score)) continue;
      const benchmark: Benchmark = {
        benchmark_id: slugify(`mirror-${name}-${row.model}`),
        model_id: row.model,
        benchmark_name: name,
        score: normalizeElo(row.score),
        score_raw: row.score,
        evaluation_date: fetchedAt,
        source: 'mirror',
        category: [name],
        rank: row.rank,
      };
      benchmarks.push(benchmark);
    }
    console.log(`  mirror/${name}: ${file.models.length} rows -> ${benchmarks.length} records`);
  }

  return { count: benchmarks.length, benchmarks };
}
