import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModel, mergeModelData, saveModel } from '@basemodel/registry';
import { z } from 'zod';
import type { CollectionResult, GatewayPlugin, SimpleGateway } from './collector';

// ---------------------------------------------------------------------------
// OpenAI-Compatible Template
// Handles any gateway that follows the /v1/models format.
// ---------------------------------------------------------------------------

const OpenAICompatibleResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      context_length: z.number().optional(),
      created: z.number().optional(),
    }),
  ),
});

async function runSimpleGateway(plugin: SimpleGateway): Promise<CollectionResult> {
  const result: CollectionResult = {
    provider_id: plugin.id,
    models: [],
    errors: [],
  };

  const apiKey = process.env[plugin.secretKeyName];

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else {
      console.warn(
        `  ⚠️  No API key found for secret "${plugin.secretKeyName}". Attempting unauthenticated request...`,
      );
    }

    const response = await fetch(`${plugin.baseUrl}/models`, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rawJson = (await response.json()) as unknown;
    const parsed = OpenAICompatibleResponseSchema.safeParse(rawJson);

    if (!parsed.success) {
      result.errors.push(`Failed to parse response from "${plugin.id}": ${parsed.error.message}`);
      return result;
    }

    for (const apiModel of parsed.data.data) {
      result.models.push({
        model_id: `${plugin.id}/${apiModel.id}`,
        provider_id: plugin.id,
        name: apiModel.id,
        context_window: apiModel.context_length,
        status: 'active',
        modality: ['text'],
        open_weight: false,
        reasoning_support: false,
        function_calling: false,
        structured_output: false,
        vision_support: false,
        audio_support: false,
        image_generation: false,
        embedding_support: false,
      });
    }
  } catch (error: unknown) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Registry Save Helper
// ---------------------------------------------------------------------------

async function persistResult(result: CollectionResult): Promise<void> {
  let updatedCount = 0;
  let newCount = 0;
  let failedCount = 0;

  for (const partialModel of result.models) {
    if (!partialModel.model_id) continue;

    const existing = await getModel(partialModel.model_id);
    const mergedResult = mergeModelData(existing, partialModel);

    if (mergedResult.success && mergedResult.data) {
      await saveModel(mergedResult.data);
      if (existing) {
        updatedCount++;
      } else {
        newCount++;
      }
    } else {
      console.error(`  ❌ Failed to merge/validate ${partialModel.model_id}:`, mergedResult.errors);
      failedCount++;
    }
  }

  console.log(`  📊 New: ${newCount} | Updated: ${updatedCount} | Failed: ${failedCount}`);
}

// ---------------------------------------------------------------------------
// Auto-Discovery Runner — Main Export
// ---------------------------------------------------------------------------

/**
 * Scans the `gateways/` directory, loads all plugins, and runs them.
 * This is the entry point for the collection pipeline.
 */
export async function runAllGateways(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const gatewaysDir = path.join(__dirname, '..', 'gateways');

  if (!fs.existsSync(gatewaysDir)) {
    console.warn('⚠️  No gateways/ directory found. Nothing to collect.');
    return;
  }

  const files = fs
    .readdirSync(gatewaysDir)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('_'));

  if (files.length === 0) {
    console.warn('⚠️  No gateway plugins found in gateways/. Nothing to collect.');
    return;
  }

  console.log(`🔌 Found ${files.length} gateway plugin(s): ${files.join(', ')}`);

  const secrets: Record<string, string | undefined> = { ...process.env };

  for (const file of files) {
    const pluginPath = path.join(gatewaysDir, file);
    const pluginName = path.basename(file, path.extname(file));

    console.log(`\n⏳ Running gateway: ${pluginName}...`);

    try {
      const mod = (await import(pluginPath)) as { default?: GatewayPlugin };
      const plugin = mod.default;

      if (!plugin || !plugin.type || !plugin.id) {
        console.warn(`  ⚠️  Skipping "${file}": invalid plugin (missing type or id).`);
        continue;
      }

      let result: CollectionResult | undefined;
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts && !result) {
        attempt++;
        try {
          if (plugin.type === 'openai-compatible') {
            result = await runSimpleGateway(plugin);
          } else {
            result = await plugin.collect(secrets);
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(
            `  ⚠️  Attempt ${attempt}/${maxAttempts} failed for "${pluginName}": ${errMsg}`,
          );
          if (attempt >= maxAttempts) {
            throw err;
          }
          // Exponential backoff: 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
        }
      }

      if (result && result.errors.length > 0) {
        console.warn(`  ⚠️  Errors encountered:`, result.errors);
      }

      if (result) {
        console.log(`  ✅ Fetched ${result.models.length} models from "${plugin.id}"`);
        await persistResult(result);
      }
    } catch (error: unknown) {
      console.error(
        `  ❌ Failed to load or run gateway "${pluginName}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
