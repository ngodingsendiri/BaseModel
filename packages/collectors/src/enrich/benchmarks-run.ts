import { runBenchmarkCollection } from './benchmarks.js';

async function main() {
  console.log('🚀 BaseModel — Benchmark Collection');
  console.log('==================================');

  const summary = await runBenchmarkCollection();

  console.log('');
  if (summary.benchmarkRows === 0) {
    // Fail loud: an empty benchmark dataset must be visible in CI, not
    // shipped silently. Partial source failures (e.g. LMArena down while the
    // mirror fallback and OpenLLM succeed) keep the pipeline green — they are
    // the designed degraded path, logged as warnings above.
    console.log(
      `❌ No benchmarks collected from any source (${summary.errors.length} error(s)); keeping the previous dataset.`,
    );
    process.exitCode = 1;
  } else if (summary.errors.length > 0) {
    console.log(
      `⚠️ Benchmark collection finished with ${summary.errors.length} warning(s) and ${summary.benchmarkRows} row(s).`,
    );
  } else {
    console.log('🎉 Benchmark collection finished successfully.');
  }
}

main().catch((err: unknown) => {
  console.error('❌ Benchmark collection failed:', err);
  process.exit(1);
});
