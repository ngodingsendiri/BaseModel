import { clearBenchmarksRegistry } from '@basemodel/registry';
import { enrichBM } from './sources/lmarena.js';
import { enrichMirror } from './sources/mirror.js';
import { enrichOpenLLM } from './sources/openllm.js';

export interface BenchmarkCollectionSummary {
  benchmarkRows: number;
  mirrorFallback: boolean;
  errors: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Collects benchmarks from LMArena, the Open LLM Leaderboard, and (as a
 * degraded fallback when LMArena is unavailable) the GitHub raw mirror.
 * The benchmark registry is rewritten from scratch on every run.
 */
export async function runBenchmarkCollection(): Promise<BenchmarkCollectionSummary> {
  const summary: BenchmarkCollectionSummary = {
    benchmarkRows: 0,
    mirrorFallback: false,
    errors: [],
  };

  await clearBenchmarksRegistry();

  const accessToken = process.env.BENCHMARKS_FETCH_TOKEN;

  let lmarenaRows = 0;
  try {
    const result = await enrichBM(accessToken);
    lmarenaRows = result.count;
    summary.benchmarkRows += result.count;
  } catch (error: unknown) {
    summary.errors.push(`Failed to enrich benchmarks from LMArena: ${errorMessage(error)}`);
  }

  // Mirror is a fallback for the primary arena source only; when LMArena
  // succeeds it is skipped to avoid storing the same data twice.
  if (lmarenaRows === 0) {
    try {
      const result = await enrichMirror();
      summary.benchmarkRows += result.count;
      summary.mirrorFallback = true;
      console.log(`Enriched ${result.count} benchmarks from Mirror snapshot (LMArena fallback)`);
    } catch (error: unknown) {
      summary.errors.push(`Failed to enrich benchmarks from Mirror: ${errorMessage(error)}`);
    }
  }

  try {
    const result = await enrichOpenLLM(accessToken);
    summary.benchmarkRows += result.count;
    console.log(`Enriched ${result.count} benchmarks from Open LLM Leaderboard`);
  } catch (error: unknown) {
    summary.errors.push(
      `Failed to enrich benchmarks from Open LLM Leaderboard: ${errorMessage(error)}`,
    );
  }

  console.log(`  benchmarks   : ${summary.benchmarkRows} rows collected`);
  if (summary.mirrorFallback) {
    console.warn('  note         : LMArena unavailable, used Mirror snapshot as fallback');
  }
  if (summary.errors.length > 0) {
    console.warn('Benchmark collection errors:', summary.errors);
  }

  return summary;
}
