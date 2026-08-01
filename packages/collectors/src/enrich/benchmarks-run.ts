import { runBenchmarkCollection } from './benchmarks.js';

async function main() {
  console.log('🚀 BaseModel — Benchmark Collection');
  console.log('==================================');

  const summary = await runBenchmarkCollection();

  console.log('');
  if (summary.errors.length > 0) {
    console.log('⚠️ Benchmark collection completed with warnings.');
    process.exitCode = 0;
  } else {
    console.log('🎉 Benchmark collection finished successfully.');
  }
}

main().catch((err: unknown) => {
  console.error('❌ Benchmark collection failed:', err);
  process.exit(1);
});
