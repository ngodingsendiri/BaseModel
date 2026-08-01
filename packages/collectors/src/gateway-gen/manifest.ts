import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const GatewayAuthSchema = z
  .object({
    type: z.enum(['bearer', 'header', 'query']),
    secret: z.string().min(1),
    headerName: z.string().optional(),
  })
  .optional();

export const ManifestGatewaySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  baseUrl: z.string().url(),
  endpoint: z.string().optional(),
  method: z.enum(['GET', 'POST']).default('GET'),
  auth: GatewayAuthSchema,
  extraHeaders: z.record(z.string(), z.string()).optional(),
  secrets: z.array(z.string()).default([]),
  sample: z.unknown().optional(),
  notes: z.string().optional(),
});

export const ManifestSchema = z.object({
  version: z.number().int().positive().default(1),
  gateways: z.array(ManifestGatewaySchema),
});

export type ManifestGateway = z.infer<typeof ManifestGatewaySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export const GATEWAYS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'gateways',
);

export const FIXTURES_DIR = path.join(GATEWAYS_DIR, '__fixtures__');

export function getManifestPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'manifest.json');
}

export async function loadManifest(): Promise<Manifest> {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const raw = await readFile(manifestPath, 'utf-8');
  const parsed = ManifestSchema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    throw new Error(`Invalid gateway manifest: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function findGateway(gatewayId: string): Promise<ManifestGateway> {
  const manifest = await loadManifest();
  const gateway = manifest.gateways.find((entry) => entry.id === gatewayId);
  if (!gateway) {
    throw new Error(
      `Gateway "${gatewayId}" is not listed in ${getManifestPath()}. ` +
        'Add it first so the generator knows its endpoint and auth.',
    );
  }
  return gateway;
}

export function getGatewayPluginPath(gatewayId: string): string {
  return path.join(GATEWAYS_DIR, `${gatewayId}.ts`);
}

export function getFixturePath(gatewayId: string): string {
  return path.join(FIXTURES_DIR, `${gatewayId}.raw.json`);
}
