import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { Benchmark } from '@basemodel/schema';

/**
 * Resolves the absolute path to the data/registry directory.
 *
 * Priority:
 * 1. BASEMODEL_REGISTRY_PATH env var (explicit override).
 * 2. Walk up from process.cwd() up to 10 levels until data/registry is found.
 * 3. Silently fall back to cwd-based relative path.
 */
function getRegistryRoot(): string {
  const envOverride = process.env.BASEMODEL_REGISTRY_PATH;
  if (envOverride && existsSync(envOverride)) return envOverride;

  const cwd = process.cwd();
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'data', 'registry');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(cwd, 'data', 'registry');
}

const REGISTRY_ROOT = getRegistryRoot();

/** Returns a safe temporary path in the same directory (same filesystem). */
function tempPath(target: string): string {
  return `${target}.tmp-${process.pid}`;
}

export async function readRegistryFile<T>(relativePath: string): Promise<T | null> {
  const fullPath = join(REGISTRY_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  const raw = await readFile(fullPath, 'utf-8');
  return JSON.parse(raw) as T;
}

/**
 * Atomically writes a JSON file: write to a temp file, then rename.
 * Rename on the same filesystem is atomic in practice.
 */
export async function writeRegistryFile<T>(relativePath: string, data: T): Promise<void> {
  const fullPath = join(REGISTRY_ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  const tmp = tempPath(fullPath);
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  await rename(tmp, fullPath);
}

export async function listRegistryFiles(subDir: string): Promise<string[]> {
  const fullPath = join(REGISTRY_ROOT, subDir);
  if (!existsSync(fullPath)) return [];
  return collectJsonFiles(fullPath, fullPath);
}

async function collectJsonFiles(dir: string, rootDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectJsonFiles(entryPath, rootDir);
      results.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const relative = entryPath.startsWith(rootDir + sep)
        ? entryPath.slice(rootDir.length + 1)
        : entryPath.replace(`${rootDir}/`, '');
      results.push(relative);
    }
  }

  return results;
}

export async function readAllFromDirectory<T>(subDir: string): Promise<T[]> {
  const files = await listRegistryFiles(subDir);
  const results: T[] = [];
  for (const file of files) {
    const data = await readRegistryFile<T>(join(subDir, file));
    if (data !== null) results.push(data);
  }
  return results;
}

export async function readAllArraysFromDirectory<T>(subDir: string): Promise<T[]> {
  const files = await listRegistryFiles(subDir);
  const results: T[] = [];
  for (const file of files) {
    const data = await readRegistryFile<T[]>(join(subDir, file));
    if (data !== null && Array.isArray(data)) results.push(...data);
  }
  return results;
}

export async function clearRegistryDirectory(subDir: string): Promise<void> {
  const fullPath = join(REGISTRY_ROOT, subDir);
  if (!existsSync(fullPath)) return;
  await rm(fullPath, { recursive: true, force: true });
}

/** Deletes a single file from the registry, silently skipping if absent. */
export async function deleteRegistryFile(relativePath: string): Promise<void> {
  const fullPath = join(REGISTRY_ROOT, relativePath);
  if (!existsSync(fullPath)) return;
  await rm(fullPath, { force: true });
}

/**
 * Writes the benchmark set as one array file per source (rollup).
 *
 * Benchmarks are far too numerous to persist one-file-per-record (tens of
 * thousands of tiny JSON files per nightly run bloats the git repository).
 * Grouping by source keeps writes atomic and cheap while preserving
 * provenance.
 *
 * Merge semantics: records from sources NOT present in this run are kept, so
 * a source that failed tonight (rate limit, outage) never wipes its previous
 * data — only sources that actually produced rows are refreshed.
 */
export async function writeBenchmarksRollup(
  benchmarks: Benchmark[],
  existing: Benchmark[] = [],
): Promise<void> {
  const bySource = new Map<string, Benchmark[]>();
  for (const benchmark of benchmarks) {
    const list = bySource.get(benchmark.source) ?? [];
    list.push(benchmark);
    bySource.set(benchmark.source, list);
  }
  const refreshedSources = new Set(bySource.keys());
  const kept = existing.filter((benchmark) => !refreshedSources.has(benchmark.source));
  const merged = [...kept, ...benchmarks];

  const mergedBySource = new Map<string, Benchmark[]>();
  for (const benchmark of merged) {
    const list = mergedBySource.get(benchmark.source) ?? [];
    list.push(benchmark);
    mergedBySource.set(benchmark.source, list);
  }

  await clearRegistryDirectory('benchmarks');
  for (const [source, records] of mergedBySource) {
    await writeRegistryFile(`benchmarks/${source}.json`, records);
  }
}
