import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { getAllProviders, getAllModels, getAllCapabilities, getAllLicenses } from '@basemodel/registry';

const SCHEMA_VERSION = '0.1.0';

/**
 * Finds the workspace root by walking up from process.cwd() until
 * we find a directory that contains package.json with name "basemodel".
 */
function getWorkspaceRoot(): string {
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

function getSourceRevision(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function generate(): Promise<void> {
  const generated_at = new Date().toISOString();
  const source_revision = getSourceRevision();

  const meta = {
    schema_version: SCHEMA_VERSION,
    generated_at,
    source_revision,
  };

  console.log('📦 BaseModel — Dataset Generator');
  console.log(`   schema_version : ${meta.schema_version}`);
  console.log(`   generated_at   : ${meta.generated_at}`);
  console.log(`   source_revision: ${meta.source_revision}`);
  console.log(`   output_dir     : ${OUTPUT_DIR}`);
  console.log('');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // --- providers.json ---
  console.log('⏳ Reading providers...');
  const providers = await getAllProviders();
  await writeFile(
    join(OUTPUT_DIR, 'providers.json'),
    JSON.stringify({ ...meta, count: providers.length, providers }, null, 2) + '\n',
  );
  console.log(`✅ providers.json — ${providers.length} records`);

  // --- models.json ---
  console.log('⏳ Reading models...');
  const models = await getAllModels();
  await writeFile(
    join(OUTPUT_DIR, 'models.json'),
    JSON.stringify({ ...meta, count: models.length, models }, null, 2) + '\n',
  );
  console.log(`✅ models.json — ${models.length} records`);

  // --- capabilities.json ---
  console.log('⏳ Reading capabilities...');
  const capabilities = await getAllCapabilities();
  await writeFile(
    join(OUTPUT_DIR, 'capabilities.json'),
    JSON.stringify({ ...meta, count: capabilities.length, capabilities }, null, 2) + '\n',
  );
  console.log(`✅ capabilities.json — ${capabilities.length} records`);

  // --- licenses.json ---
  console.log('⏳ Reading licenses...');
  const licenses = await getAllLicenses();
  await writeFile(
    join(OUTPUT_DIR, 'licenses.json'),
    JSON.stringify({ ...meta, count: licenses.length, licenses }, null, 2) + '\n',
  );
  console.log(`✅ licenses.json — ${licenses.length} records`);

  console.log('');
  console.log(`🎉 Done. Datasets written to: ${OUTPUT_DIR}`);
}

generate().catch((err: unknown) => {
  console.error('❌ Generation failed:', err);
  process.exit(1);
});
