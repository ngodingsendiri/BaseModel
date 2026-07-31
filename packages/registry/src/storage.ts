import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Resolves the absolute path to the data/registry directory.
 *
 * When running via `pnpm generate` from the workspace root (via `pnpm --filter`),
 * process.cwd() is the workspace root. We use that as the anchor.
 *
 * Fallback: if the cwd doesn't contain a data/registry directory, walk up until found.
 */
function getRegistryRoot(): string {
  const cwd = process.cwd();
  // pnpm --filter runs scripts with cwd set to the package dir (packages/publisher)
  // So we walk up to find the workspace root that contains data/registry
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'data', 'registry');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  // Last resort: relative from cwd
  return join(cwd, 'data', 'registry');
}

const REGISTRY_ROOT = getRegistryRoot();

/**
 * Reads a single JSON file from the registry directory and parses it.
 * Returns null if the file does not exist.
 */
export async function readRegistryFile<T>(relativePath: string): Promise<T | null> {
  const fullPath = join(REGISTRY_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  const raw = await readFile(fullPath, 'utf-8');
  return JSON.parse(raw) as T;
}

/**
 * Writes a JSON object to a file in the registry directory.
 * Creates parent directories as needed.
 */
export async function writeRegistryFile<T>(relativePath: string, data: T): Promise<void> {
  const fullPath = join(REGISTRY_ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/**
 * Recursively lists all JSON file paths (relative to subDir) inside a registry subdirectory.
 */
export async function listRegistryFiles(subDir: string): Promise<string[]> {
  const fullPath = join(REGISTRY_ROOT, subDir);
  if (!existsSync(fullPath)) {
    return [];
  }
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
      results.push(entryPath.replace(`${rootDir}\\`, '').replace(`${rootDir}/`, ''));
    }
  }

  return results;
}

/**
 * Reads all JSON files from a subdirectory and returns them as a typed array.
 */
export async function readAllFromDirectory<T>(subDir: string): Promise<T[]> {
  const files = await listRegistryFiles(subDir);
  const results: T[] = [];
  for (const file of files) {
    const data = await readRegistryFile<T>(join(subDir, file));
    if (data !== null) {
      results.push(data);
    }
  }
  return results;
}

/**
 * Reads all JSON files from a subdirectory where each file contains an ARRAY of records.
 * Flattens all arrays into a single typed result array.
 * Used for data types like Pricing where multiple records share a single file.
 */
export async function readAllArraysFromDirectory<T>(subDir: string): Promise<T[]> {
  const files = await listRegistryFiles(subDir);
  const results: T[] = [];
  for (const file of files) {
    const data = await readRegistryFile<T[]>(join(subDir, file));
    if (data !== null && Array.isArray(data)) {
      results.push(...data);
    }
  }
  return results;
}

/**
 * Deletes every JSON file inside a registry subdirectory.
 * Used to remove stale files when a directory is rewritten from scratch.
 */
export async function clearRegistryDirectory(subDir: string): Promise<void> {
  const fullPath = join(REGISTRY_ROOT, subDir);
  if (!existsSync(fullPath)) return;
  await rm(fullPath, { recursive: true, force: true });
}
