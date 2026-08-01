import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { ManifestGateway } from './manifest.js';
import { FIXTURES_DIR, getFixturePath } from './manifest.js';

const DEFAULT_ENDPOINTS = [
  '/models',
  '/v1/models',
  '/api/models',
  '/api/v1/models',
  '/model',
  '/models?limit=5',
];

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export interface ModelArrayCandidate {
  path: string;
  count: number;
  keys: string[];
  example: unknown;
}

export interface ShapeSummary {
  topLevel: Record<string, string>;
  modelArray: ModelArrayCandidate | null;
}

export interface ProbeResult {
  gatewayId: string;
  fixturePath: string;
  endpoint: string;
  fromSample: boolean;
  raw: unknown;
  shape: ShapeSummary;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function truncateString(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function truncateExample(value: unknown, depth = 0): unknown {
  if (depth > 3) return typeof value;
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => truncateExample(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = typeof item === 'string' ? truncateString(item) : truncateExample(item, depth + 1);
    }
    return out;
  }
  return value;
}

function findModelArray(value: unknown): ModelArrayCandidate | null {
  let best: ModelArrayCandidate | null = null;
  const visit = (node: unknown, pathLabel: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const objects = node.filter((item) => item !== null && typeof item === 'object');
      const hasIdOrName = objects.some(
        (item) =>
          typeof (item as Record<string, unknown>).id === 'string' ||
          typeof (item as Record<string, unknown>).name === 'string',
      );
      if (objects.length > 0 && hasIdOrName && (!best || objects.length > best.count)) {
        const first = objects[0] as Record<string, unknown>;
        best = {
          path: pathLabel,
          count: objects.length,
          keys: Object.keys(first),
          example: truncateExample(first),
        };
      }
      for (const item of objects.slice(0, 5)) visit(item, `${pathLabel}[i]`);
      return;
    }
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      visit(item, `${pathLabel}.${key}`);
    }
  };
  visit(value, '$');
  return best;
}

export function extractShape(raw: unknown): ShapeSummary {
  const topLevel: Record<string, string> = {};
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      topLevel[key] = typeName(value);
    }
  }
  return { topLevel, modelArray: findModelArray(raw) };
}

function redact(value: string, secrets: readonly string[]): string {
  return secrets
    .filter(Boolean)
    .reduce((result, secret) => result.split(String(secret)).join('[REDACTED]'), value);
}

function truncateArrays(value: unknown, depth = 0): unknown {
  if (depth > 8) return typeof value;
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => truncateArrays(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = truncateArrays(item, depth + 1);
    }
    return out;
  }
  return value;
}

function buildHeaders(
  gateway: ManifestGateway,
  env: NodeJS.ProcessEnv,
): { headers: Record<string, string>; ok: boolean; missing: string[] } {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (gateway.extraHeaders) Object.assign(headers, gateway.extraHeaders);
  const missing: string[] = [];
  if (gateway.auth) {
    const key = env[gateway.auth.secret];
    if (!key) {
      missing.push(gateway.auth.secret);
    } else if (gateway.auth.type === 'bearer') {
      headers.Authorization = `Bearer ${key}`;
    } else if (gateway.auth.type === 'header') {
      headers[gateway.auth.headerName ?? 'x-api-key'] = key;
    }
  }
  if (gateway.method === 'POST') headers['Content-Type'] = 'application/json';
  return { headers, ok: missing.length === 0, missing };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  attempts = 2,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  let last: Response | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, init);
    if (!RETRYABLE_STATUSES.has(response.status)) {
      const data = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, data };
    }
    last = response;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  return { ok: false, status: last?.status ?? 0, data: null };
}

export async function probeGateway(
  gateway: ManifestGateway,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProbeResult> {
  const { headers, ok, missing } = buildHeaders(gateway, env);
  const hasSample = gateway.sample !== undefined;

  const sampleResult = async (): Promise<ProbeResult> => {
    const fixturePath = await saveFixture(gateway.id, gateway.sample, gateway.secrets);
    return {
      gatewayId: gateway.id,
      fixturePath,
      endpoint: gateway.endpoint ?? '(manifest sample)',
      fromSample: true,
      raw: gateway.sample,
      shape: extractShape(gateway.sample),
    };
  };

  const liveResult = async (): Promise<ProbeResult> => {
    const endpoints = gateway.endpoint ? [gateway.endpoint] : DEFAULT_ENDPOINTS;
    const failures: string[] = [];
    for (const endpoint of endpoints) {
      const url = new URL(endpoint, gateway.baseUrl).toString();
      try {
        const result = await fetchJson(url, {
          method: gateway.method,
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (result.ok && result.data !== null) {
          const fixturePath = await saveFixture(gateway.id, result.data, gateway.secrets);
          return {
            gatewayId: gateway.id,
            fixturePath,
            endpoint,
            fromSample: false,
            raw: result.data,
            shape: extractShape(result.data),
          };
        }
        failures.push(`${endpoint} -> HTTP ${result.status}`);
      } catch (error: unknown) {
        failures.push(`${endpoint} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(
      `Probe for ${gateway.id} failed on all candidate endpoints: ${failures.join(' | ')}`,
    );
  };

  if (hasSample && !ok) {
    console.warn(`  probe : no API key available, using manifest sample`);
    return sampleResult();
  }
  if (hasSample && ok) {
    try {
      return await liveResult();
    } catch (error) {
      console.warn(
        `  probe : live probe failed (${error instanceof Error ? error.message : String(error)}), using manifest sample`,
      );
      return sampleResult();
    }
  }
  if (!ok) {
    throw new Error(
      `Cannot probe ${gateway.id}: missing API key(s) ${missing.join(', ')}. ` +
        'Set them in the environment, or add a "sample" to the manifest to skip live probing.',
    );
  }
  return liveResult();
}

export async function saveFixture(
  gatewayId: string,
  raw: unknown,
  secrets: readonly string[],
): Promise<string> {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const serialized = JSON.stringify(truncateArrays(raw), null, 2);
  const safe = redact(serialized, secrets);
  const fixturePath = getFixturePath(gatewayId);
  await writeFile(fixturePath, `${safe}\n`, 'utf-8');
  return fixturePath;
}

export async function readFixture(gatewayId: string): Promise<unknown> {
  const fixturePath = getFixturePath(gatewayId);
  const raw = await readFile(fixturePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

export function fixtureExists(gatewayId: string): boolean {
  return existsSync(getFixturePath(gatewayId));
}
