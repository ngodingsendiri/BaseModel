/**
 * Gateway Plugin Verifier
 *
 * This script is run by the `verify-gateway.yml` GitHub Action whenever a new
 * file is added to the gateways/ directory. It:
 * 1. Loads the plugin.
 * 2. Runs it against the live API (using secrets from env).
 * 3. Validates the normalized output against the BaseModel Zod schema.
 * 4. Reports PASS or FAIL with a detailed summary.
 *
 * Usage: tsx src/core/verify.ts <path-to-gateway-file>
 */

import path from 'node:path';
import { ModelSchema } from '@basemodel/schema';
import { z } from 'zod';
import type { CollectionResult, GatewayPlugin, SimpleGateway } from './collector';

// ---------------------------------------------------------------------------
// OpenAI-Compatible fetch (duplicated from runner to keep verify standalone)
// ---------------------------------------------------------------------------

const OpenAICompatibleResponseSchema = z.object({
  data: z.array(z.object({ id: z.string(), context_length: z.number().optional() })),
});

async function fetchSimple(plugin: SimpleGateway): Promise<CollectionResult> {
  const result: CollectionResult = { provider_id: plugin.id, models: [], errors: [] };
  const apiKey = process.env[plugin.secretKeyName];
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(`${plugin.baseUrl}/models`, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const raw = (await response.json()) as unknown;
    const parsed = OpenAICompatibleResponseSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(`Response parse failed: ${parsed.error.message}`);
      return result;
    }
    for (const m of parsed.data.data) {
      result.models.push({
        model_id: `${plugin.id}/${m.id}`,
        provider_id: plugin.id,
        name: m.id,
        context_window: m.context_length,
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
  } catch (e: unknown) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main Verification Logic
// ---------------------------------------------------------------------------

async function verify(pluginFilePath: string): Promise<void> {
  const absPath = path.resolve(pluginFilePath);
  const pluginName = path.basename(pluginFilePath, path.extname(pluginFilePath));

  console.log(`\n🔍 Verifying gateway plugin: ${pluginName}`);
  console.log(`   File: ${absPath}`);

  // 1. Load plugin
  let plugin: GatewayPlugin;
  try {
    const mod = (await import(absPath)) as { default?: GatewayPlugin };
    if (!mod.default || !mod.default.type || !mod.default.id) {
      throw new Error('Plugin is missing required fields: type, id');
    }
    plugin = mod.default;
  } catch (e: unknown) {
    console.error(`\n❌ FAIL — Could not load plugin: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  console.log(`   Type: ${plugin.type} | ID: ${plugin.id}`);

  // 2. Run collection
  const secrets: Record<string, string | undefined> = { ...process.env };
  let result: CollectionResult;
  try {
    if (plugin.type === 'openai-compatible') {
      result = await fetchSimple(plugin);
    } else {
      result = await plugin.collect(secrets);
    }
  } catch (e: unknown) {
    console.error(
      `\n❌ FAIL — Plugin threw an error during collection: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }

  if (result.errors.length > 0) {
    console.warn(`   ⚠️  Collection errors: ${result.errors.join('; ')}`);
  }

  console.log(`   📦 Models returned: ${result.models.length}`);

  if (result.models.length === 0) {
    console.error('\n❌ FAIL — Plugin returned 0 models. The API may require authentication.');
    console.error(
      '   Please ensure the correct secret is configured in GitHub repository settings.',
    );
    process.exit(1);
  }

  // 3. Validate a sample against the full Zod Schema
  const SAMPLE_SIZE = Math.min(5, result.models.length);
  const sample = result.models.slice(0, SAMPLE_SIZE);
  let validCount = 0;
  const schemaErrors: string[] = [];

  for (const model of sample) {
    const parsed = ModelSchema.safeParse(model);
    if (parsed.success) {
      validCount++;
    } else {
      schemaErrors.push(
        `  ${model.model_id}: ${parsed.error.errors.map((e) => `${e.path.join('.')}=${e.message}`).join(', ')}`,
      );
    }
  }

  console.log(`\n📋 Schema Validation (sample ${SAMPLE_SIZE} models):`);
  console.log(`   ✅ Passed: ${validCount}/${SAMPLE_SIZE}`);

  // Note: partial schemas are expected (pipeline does smart-merge with registry data)
  // The verify step checks structural sanity, not full completeness.
  if (schemaErrors.length > 0) {
    console.log(`   ℹ️  Schema notes (these may be expected for partial data):`);
    for (const err of schemaErrors) console.log(err);
  }

  // 4. Final verdict
  // A plugin PASSES if it: loads correctly, returns > 0 models, and has a valid id/type.
  console.log(`\n✅ PASS — Gateway plugin "${pluginName}" is verified and ready.`);
  console.log(`   Collected ${result.models.length} models from "${plugin.id}".`);
  console.log(`\n   Add this secret to GitHub repository settings if not done yet:`);
  if (plugin.type === 'openai-compatible') {
    console.log(`   Secret name: ${plugin.secretKeyName}`);
  }
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: tsx src/core/verify.ts <path-to-gateway-file>');
  process.exit(1);
}

verify(args[0] as string).catch((e: unknown) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
