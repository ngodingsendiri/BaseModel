import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  bestModels,
  buildV2Snapshot,
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
  readRegistryFile,
} from '@basemodel/registry';
import type { Capability, Model, Pricing, Provider } from '@basemodel/schema';
import { BLENDED_DIVISOR, INPUT_WEIGHT, OUTPUT_WEIGHT } from '@basemodel/schema';

/** Used only when the schema package manifest cannot be located. */
const FALLBACK_SCHEMA_VERSION = '0.1.0';

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

/**
 * Reads the schema package version so published datasets always report the
 * schema version they were generated against, instead of a hardcoded copy.
 */
export function getSchemaVersion(workspaceRoot: string): string {
  try {
    const pkgPath = join(workspaceRoot, 'packages', 'schema', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // fall through to the fallback below
  }
  return FALLBACK_SCHEMA_VERSION;
}

/**
 * Validates cross-entity relations BEFORE any dataset file is written, so a
 * broken registry can never produce a partially written, invalid dist/.
 */
export function validateRelations(
  providers: Provider[],
  models: Model[],
  capabilities: Capability[],
  pricing: Pricing[],
): void {
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
  // Pricing rows may legitimately reference models outside the catalog
  // (aggregate catalogs), so orphans are reported as a warning, not a failure.
  const modelIds = new Set(models.map((m) => m.model_id));
  const orphanedPricing = pricing.filter((p) => !modelIds.has(p.model_id)).length;
  if (orphanedPricing > 0) {
    console.warn(
      `⚠️  ${orphanedPricing} pricing record(s) reference models not present in the catalog.`,
    );
  }
}

export async function generate(outputDir = OUTPUT_DIR): Promise<void> {
  const source_revision = getSourceRevision();
  const generated_at = new Date().toISOString();

  const meta = {
    schema_version: getSchemaVersion(getWorkspaceRoot()),
    source_revision,
    generated_at,
  };

  console.log('📦 BaseModel — Dataset Generator');
  console.log(`   schema_version : ${meta.schema_version}`);
  console.log(`   source_revision: ${meta.source_revision}`);
  console.log(`   generated_at   : ${meta.generated_at}`);
  console.log(`   output_dir     : ${outputDir}`);
  console.log('');

  // --- Read all registry data up front ---
  console.log('⏳ Reading registry...');
  const providers = await getAllProviders();
  const models = await getAllModels();
  const capabilities = await getAllCapabilities();
  const licenses = await getAllLicenses();
  const apis = await getAllApis();
  const benchmarks = await getAllBenchmarks();
  const pricing = await getAllPricing();

  // --- Validate relations BEFORE writing anything ---
  console.log('🔍 Validating relations...');
  validateRelations(providers, models, capabilities, pricing);
  console.log('✅ Relations are valid.');

  // --- Derive intelligence ---
  console.log('⏳ Deriving intelligence...');
  const engine = new IntelligenceEngine();
  // hydrate() validates the snapshot against the canonical schemas, unlike
  // assigning the public fields directly.
  engine.hydrate({ models, providers, capabilities, pricing, benchmarks });

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

  // The published dataset feeds the catalog UI, which matches benchmark rows
  // to catalog models by last path segment. Keep only those rows so the
  // published file stays lean; the full set remains in the registry. Rows
  // already carrying a fully qualified catalog model_id are kept as well.
  const lastSegment = (id: string): string => {
    const slash = id.lastIndexOf('/');
    return (slash === -1 ? id : id.slice(slash + 1)).toLowerCase();
  };
  const catalogFullIds = new Set(models.map((m) => m.model_id.toLowerCase()));
  const catalogSegments = new Set(models.map((m) => lastSegment(m.model_id)));
  const catalogBenchmarks = benchmarks.filter(
    (b) =>
      catalogFullIds.has(b.model_id.toLowerCase()) || catalogSegments.has(lastSegment(b.model_id)),
  );

  await mkdir(outputDir, { recursive: true });

  // --- providers.json ---
  console.log('⏳ Writing providers...');
  await writeFile(
    join(outputDir, 'providers.json'),
    `${JSON.stringify({ ...meta, count: providers.length, providers }, null, 2)}\n`,
  );
  console.log(`✅ providers.json — ${providers.length} records`);

  // --- models.json ---
  console.log('⏳ Writing models...');
  await writeFile(
    join(outputDir, 'models.json'),
    `${JSON.stringify({ ...meta, count: models.length, models }, null, 2)}\n`,
  );
  console.log(`✅ models.json — ${models.length} records`);

  // --- capabilities.json ---
  console.log('⏳ Writing capabilities...');
  await writeFile(
    join(outputDir, 'capabilities.json'),
    `${JSON.stringify({ ...meta, count: capabilities.length, capabilities }, null, 2)}\n`,
  );
  console.log(`✅ capabilities.json — ${capabilities.length} records`);

  // --- licenses.json ---
  console.log('⏳ Writing licenses...');
  await writeFile(
    join(outputDir, 'licenses.json'),
    `${JSON.stringify({ ...meta, count: licenses.length, licenses }, null, 2)}\n`,
  );
  console.log(`✅ licenses.json — ${licenses.length} records`);

  // --- apis.json ---
  console.log('⏳ Writing apis...');
  await writeFile(
    join(outputDir, 'apis.json'),
    `${JSON.stringify({ ...meta, count: apis.length, apis }, null, 2)}\n`,
  );
  console.log(`✅ apis.json — ${apis.length} records`);

  // --- benchmarks.json ---
  console.log('⏳ Writing benchmarks...');
  await writeFile(
    join(outputDir, 'benchmarks.json'),
    `${JSON.stringify({ ...meta, count: catalogBenchmarks.length, benchmarks: catalogBenchmarks }, null, 2)}\n`,
  );
  console.log(`✅ benchmarks.json — ${catalogBenchmarks.length} records (catalog-matched)`);

  // --- pricing.json ---
  console.log('⏳ Writing pricing...');
  await writeFile(
    join(outputDir, 'pricing.json'),
    `${JSON.stringify({ ...meta, count: pricing.length, pricing }, null, 2)}\n`,
  );
  console.log(`✅ pricing.json — ${pricing.length} records`);

  // --- intelligence.json ---
  await writeFile(
    join(outputDir, 'intelligence.json'),
    `${JSON.stringify(
      { ...meta, count: intelligenceRecords.length, intelligence: intelligenceRecords },
      null,
      2,
    )}\n`,
  );
  console.log('✅ intelligence.json —', intelligenceRecords.length, 'records');

  // --- metadata.json ---
  console.log('⏳ Writing metadata...');
  const enrichMeta =
    (await readRegistryFile<{
      generated_at?: string;
      fatal?: boolean;
      sources?: Record<string, unknown>;
      errors?: string[];
    }>('meta.json')) ?? {};
  const metadata = {
    ...meta,
    tier_definitions: {
      free: 'Both input and output cost $0 per 1M tokens.',
      budget: 'Blended cost < $0.50 per 1M tokens.',
      balanced: 'Blended cost >= $0.50 and <= $5 per 1M tokens.',
      premium: 'Blended cost > $5 per 1M tokens.',
    },
    blend: {
      input_weight: INPUT_WEIGHT,
      output_weight: OUTPUT_WEIGHT,
      divisor: BLENDED_DIVISOR,
      formula: 'blended = (input * 3 + output * 1) / 4 per 1M tokens',
    },
    enrichment: enrichMeta,
  };
  await writeFile(join(outputDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log('✅ metadata.json');

  // --- v2 datasets (canonical models + offerings) ---
  console.log('⏳ Building v2 datasets...');
  await writeV2Datasets(outputDir, meta, engine);

  // --- changes.json (change feed vs the previously published snapshot) ---
  await writeChanges(outputDir, meta, models);

  // --- manifest.json (SHA-256 per published file, written last) ---
  await writeManifest(outputDir, meta);

  console.log('');
  console.log(`🎉 Done. Datasets written to: ${outputDir}`);
}

interface RunMeta {
  schema_version: string;
  source_revision: string;
  generated_at: string;
}

/**
 * Writes the v2 datasets: canonical models, offerings, a quality-ranked
 * intelligence table with the Pareto frontier, and a CSV export.
 */
async function writeV2Datasets(
  outputDir: string,
  meta: RunMeta,
  engine: IntelligenceEngine,
): Promise<void> {
  const snapshot = buildV2Snapshot(engine);

  const v2Dir = join(outputDir, 'v2');
  await mkdir(v2Dir, { recursive: true });

  await writeFile(
    join(v2Dir, 'models.json'),
    `${JSON.stringify({ ...meta, count: snapshot.canonicals.length, models: snapshot.canonicals }, null, 2)}\n`,
  );
  console.log(`✅ v2/models.json — ${snapshot.canonicals.length} canonical models`);

  await writeFile(
    join(v2Dir, 'offerings.json'),
    `${JSON.stringify({ ...meta, count: snapshot.offerings.length, offerings: snapshot.offerings }, null, 2)}\n`,
  );
  console.log(`✅ v2/offerings.json — ${snapshot.offerings.length} offerings`);

  const ranking = bestModels(snapshot, { limit: snapshot.canonicals.length }).map((entry) => ({
    model_id: entry.canonical.model_id,
    quality_score: entry.canonical.quality?.score,
    benchmark_count: entry.canonical.quality?.benchmark_count ?? 0,
    categories: entry.canonical.quality?.categories ?? [],
    cheapest_offering: entry.offering?.offering_id,
    cheapest_provider: entry.offering?.provider_id,
    blended_cost_per_1m: entry.offering?.blended_cost_per_1m,
    pareto_optimal: entry.pareto_optimal,
  }));
  await writeFile(
    join(v2Dir, 'intelligence.json'),
    `${JSON.stringify({ ...meta, count: ranking.length, ranking }, null, 2)}\n`,
  );
  console.log(`✅ v2/intelligence.json — ${ranking.length} ranked models`);

  // CSV export of the canonical catalog for spreadsheet consumers.
  const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const cheapestByModel = new Map(
    snapshot.offerings.filter((o) => o.is_cheapest).map((o) => [o.model_id, o] as const),
  );
  const header =
    'model_id,name,status,quality_score,benchmark_count,cheapest_offering,blended_cost_per_1m,context_window,modalities';
  const lines = snapshot.canonicals.map((canonical) => {
    const cheapest = cheapestByModel.get(canonical.model_id);
    return [
      csvEscape(canonical.model_id),
      csvEscape(canonical.name),
      canonical.status,
      canonical.quality?.score ?? '',
      canonical.quality?.benchmark_count ?? '',
      cheapest ? csvEscape(cheapest.offering_id) : '',
      cheapest?.blended_cost_per_1m ?? '',
      canonical.context_window ?? '',
      csvEscape(canonical.modality.join('|')),
    ].join(',');
  });
  await writeFile(join(v2Dir, 'models.csv'), `${header}\n${lines.join('\n')}\n`);
  console.log('✅ v2/models.csv');
}

/** Reads the previously published models.json from git for the change feed. */
function readPreviousModels(): Model[] | null {
  try {
    const raw = execSync('git show HEAD:dist/models.json', {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(raw) as { models?: Model[] };
    return parsed.models ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes changes.json: the diff between this snapshot and the previously
 * committed one, so consumers can react to additions, removals, and
 * lifecycle transitions without diffing full datasets themselves.
 */
async function writeChanges(outputDir: string, meta: RunMeta, models: Model[]): Promise<void> {
  const previous = readPreviousModels();
  if (!previous) {
    console.warn('⚠️  No previous dist/models.json in git; skipping changes.json.');
    return;
  }
  const previousById = new Map(previous.map((m) => [m.model_id, m] as const));
  const currentIds = new Set(models.map((m) => m.model_id));

  const added = models.filter((m) => !previousById.has(m.model_id)).map((m) => m.model_id);
  const removed = previous.filter((m) => !currentIds.has(m.model_id)).map((m) => m.model_id);
  const statusChanged = models
    .filter((m) => {
      const prev = previousById.get(m.model_id);
      return prev !== undefined && prev.status !== m.status;
    })
    .map((m) => ({
      model_id: m.model_id,
      from: previousById.get(m.model_id)?.status,
      to: m.status,
    }));

  const cap = 100;
  const changes = {
    ...meta,
    summary: { added: added.length, removed: removed.length, status_changed: statusChanged.length },
    added: added.slice(0, cap),
    removed: removed.slice(0, cap),
    status_changed: statusChanged.slice(0, cap),
  };
  await writeFile(join(outputDir, 'changes.json'), `${JSON.stringify(changes, null, 2)}\n`);
  console.log(
    `✅ changes.json — +${added.length} added / -${removed.length} removed / ${statusChanged.length} status changes`,
  );
}

/** Recursively hashes every published file (manifest itself excluded). */
async function hashDirectory(
  dir: string,
  rootDir: string,
  files: Record<string, string>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await hashDirectory(full, rootDir, files);
    } else if (entry.isFile()) {
      const rel = relative(rootDir, full).split(sep).join('/');
      if (rel === 'manifest.json') continue;
      const content = await readFile(full);
      files[rel] = createHash('sha256').update(content).digest('hex');
    }
  }
}

/** Writes manifest.json with SHA-256 checksums so consumers can verify integrity. */
async function writeManifest(outputDir: string, meta: RunMeta): Promise<void> {
  const files: Record<string, string> = {};
  await hashDirectory(outputDir, outputDir, files);
  const sorted = Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((key) => [key, files[key]]),
  );
  await writeFile(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify({ ...meta, files: sorted }, null, 2)}\n`,
  );
  console.log(`✅ manifest.json — ${Object.keys(sorted).length} files hashed`);
}

// Auto-run only when invoked directly (`pnpm generate`), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generate().catch((err: unknown) => {
    console.error('❌ Generation failed:', err);
    process.exit(1);
  });
}
