import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  calculateCostEfficiency,
  findAlternatives,
  IntelligenceEngine,
} from '@basemodel/intelligence';
import {
  getAllApis,
  getAllBenchmarks,
  getAllCapabilities,
  getAllLicenses,
  getAllModels,
  getAllPricing,
  getAllProviders,
} from '@basemodel/registry';

const SCHEMA_VERSION = '0.1.0';

/**
 * Finds the workspace root by walking up from process.cwd() until
 * we find a directory that contains package.json with name "basemodel".
 */
export function getWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
      if (pkg.name === 'basemodel') {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const OUTPUT_DIR = join(getWorkspaceRoot(), 'dist');

export function getSourceRevision(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export async function generate(outputDir = OUTPUT_DIR): Promise<void> {
  const source_revision = getSourceRevision();

  const meta = {
    schema_version: SCHEMA_VERSION,
    source_revision,
  };

  console.log('📦 BaseModel — Dataset Generator');
  console.log(`   schema_version : ${meta.schema_version}`);
  console.log(`   source_revision: ${meta.source_revision}`);
  console.log(`   output_dir     : ${outputDir}`);
  console.log('');

  await mkdir(outputDir, { recursive: true });

  // --- providers.json ---
  console.log('⏳ Reading providers...');
  const providers = await getAllProviders();
  await writeFile(
    join(outputDir, 'providers.json'),
    `${JSON.stringify({ ...meta, count: providers.length, providers }, null, 2)}\n`,
  );
  console.log(`✅ providers.json — ${providers.length} records`);

  // --- models.json ---
  console.log('⏳ Reading models...');
  const models = await getAllModels();
  await writeFile(
    join(outputDir, 'models.json'),
    `${JSON.stringify({ ...meta, count: models.length, models }, null, 2)}\n`,
  );
  console.log(`✅ models.json — ${models.length} records`);

  // --- capabilities.json ---
  console.log('⏳ Reading capabilities...');
  const capabilities = await getAllCapabilities();
  await writeFile(
    join(outputDir, 'capabilities.json'),
    `${JSON.stringify({ ...meta, count: capabilities.length, capabilities }, null, 2)}\n`,
  );
  console.log(`✅ capabilities.json — ${capabilities.length} records`);

  // --- licenses.json ---
  console.log('⏳ Reading licenses...');
  const licenses = await getAllLicenses();
  await writeFile(
    join(outputDir, 'licenses.json'),
    `${JSON.stringify({ ...meta, count: licenses.length, licenses }, null, 2)}\n`,
  );
  console.log(`✅ licenses.json — ${licenses.length} records`);

  // --- apis.json ---
  console.log('⏳ Reading apis...');
  const apis = await getAllApis();
  await writeFile(
    join(outputDir, 'apis.json'),
    `${JSON.stringify({ ...meta, count: apis.length, apis }, null, 2)}\n`,
  );
  console.log(`✅ apis.json — ${apis.length} records`);

  // --- benchmarks.json ---
  console.log('⏳ Reading benchmarks...');
  const benchmarks = await getAllBenchmarks();
  await writeFile(
    join(outputDir, 'benchmarks.json'),
    `${JSON.stringify({ ...meta, count: benchmarks.length, benchmarks }, null, 2)}\n`,
  );
  console.log(`✅ benchmarks.json — ${benchmarks.length} records`);

  // --- pricing.json ---
  console.log('⏳ Reading pricing...');
  const pricing = await getAllPricing();
  await writeFile(
    join(outputDir, 'pricing.json'),
    `${JSON.stringify({ ...meta, count: pricing.length, pricing }, null, 2)}\n`,
  );
  console.log(`✅ pricing.json — ${pricing.length} records`);

  console.log('🔍 Validating relations...');
  const providerIds = new Set(providers.map((p) => p.provider_id));
  const capabilityIds = new Set(capabilities.map((c) => c.capability_id));
  for (const model of models) {
    if (!providerIds.has(model.provider_id)) {
      throw new Error(`Model ${model.model_id} references unknown provider ${model.provider_id}`);
    }
    if (model.capability_ids) {
      for (const cap of model.capability_ids) {
        if (!capabilityIds.has(cap)) {
          throw new Error(`Model ${model.model_id} references unknown capability ${cap}`);
        }
      }
    }
  }
  console.log('✅ Relations are valid.');

  // --- intelligence.json ---
  console.log('⏳ Deriving intelligence...');
  const engine = new IntelligenceEngine();
  engine.models = models;
  engine.providers = providers;
  engine.capabilities = capabilities;
  engine.pricing = pricing;
  // isLoaded is public; mark engine as loaded before running intelligence queries
  engine.isLoaded = true;

  const intelligenceRecords = models.map((model) => {
    const cost = calculateCostEfficiency(engine, model.model_id);
    const alternatives = findAlternatives(engine, model.model_id, 3).map((a) => ({
      model_id: a.model.model_id,
      name: a.model.name,
      reason: a.reason,
    }));
    return {
      model_id: model.model_id,
      cost_tier: cost.tier,
      blended_cost_per_1m: cost.blendedCost,
      alternatives,
    };
  });

  await writeFile(
    join(outputDir, 'intelligence.json'),
    `${JSON.stringify(
      { ...meta, count: intelligenceRecords.length, intelligence: intelligenceRecords },
      null,
      2,
    )}\n`,
  );
  console.log(`✅ intelligence.json — ${intelligenceRecords.length} records`);

  console.log('');
  console.log(`🎉 Done. Datasets written to: ${outputDir}`);
}

// Auto-run only when invoked directly (`pnpm generate`), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generate().catch((err: unknown) => {
    console.error('❌ Generation failed:', err);
    process.exit(1);
  });
}
