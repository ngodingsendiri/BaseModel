import { getModel, mergeModelData, saveModel } from '@basemodel/registry';
import type { ModelCollector } from './core/collector';
import { AnthropicCollector } from './providers/anthropic';
import { OpenAICollector } from './providers/openai';

async function runCollectors() {
  console.log('🚀 Starting Data Collection Pipeline...');

  const collectors: ModelCollector[] = [new OpenAICollector(), new AnthropicCollector()];

  for (const collector of collectors) {
    console.log(`\n⏳ Running collector: ${collector.providerId}...`);

    const result = await collector.fetchModels();

    if (result.errors.length > 0) {
      console.warn(`⚠️  Collector ${collector.providerId} encountered errors:`, result.errors);
    }

    console.log(`✅ Fetched ${result.models.length} models from ${collector.providerId}`);

    let updatedCount = 0;
    let newCount = 0;
    let failedCount = 0;

    for (const partialModel of result.models) {
      if (!partialModel.model_id) continue;

      // 1. Fetch existing data from registry (if it exists)
      const existing = await getModel(partialModel.model_id);

      // 2. Merge API data with existing manual data
      const mergedResult = mergeModelData(existing, partialModel);

      if (mergedResult.success && mergedResult.data) {
        // 3. Save the merged, strictly validated result back to the registry
        await saveModel(mergedResult.data);
        if (existing) {
          updatedCount++;
        } else {
          newCount++;
        }
      } else {
        console.error(`❌ Failed to merge/validate ${partialModel.model_id}:`, mergedResult.errors);
        failedCount++;
      }
    }

    console.log(`📊 Stats for ${collector.providerId}:`);
    console.log(`   - New models discovered: ${newCount}`);
    console.log(`   - Existing models updated: ${updatedCount}`);
    if (failedCount > 0) {
      console.log(`   - Validation failures: ${failedCount}`);
    }
  }

  console.log('\n🎉 Pipeline finished successfully.');
}

runCollectors().catch((err: unknown) => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
