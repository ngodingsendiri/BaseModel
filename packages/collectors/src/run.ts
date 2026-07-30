import { runAllGateways } from './core/runner';

async function main() {
  console.log('🚀 BaseModel — Universal Data Collection Pipeline');
  console.log('================================================');
  console.log('Auto-discovering gateway plugins from gateways/ ...\n');

  await runAllGateways();

  console.log('\n🎉 Pipeline finished successfully.');
}

main().catch((err: unknown) => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
