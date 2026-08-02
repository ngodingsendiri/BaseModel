import { runEnrichment } from './index';

async function main() {
  console.log('🚀 BaseModel — Registry Enrichment');
  console.log('==================================');

  const summary = await runEnrichment();

  console.log('');
  if (summary.fatal) {
    console.log('❌ Enrichment failed: all primary pricing sources were unavailable.');
    process.exit(1);
  }
  if (summary.errors.length > 0) {
    console.log('⚠️ Enrichment completed with warnings.');
  } else {
    console.log('🎉 Enrichment finished successfully.');
  }
}

main().catch((err: unknown) => {
  console.error('❌ Enrichment failed:', err);
  process.exit(1);
});
