/**
 * Gateway Plugin Verifier
 *
 * Plugins are loaded and executed through the same isolated worker boundary as
 * the production collector. This avoids making verification a privileged path.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelSchema } from '@basemodel/schema';
import { resolveGatewayPluginPath } from './plugin-path.js';
import { describeGatewayPlugin, executeGatewayPlugin } from './runner.js';

async function verify(pluginFilePath: string): Promise<void> {
  const gatewaysDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'gateways',
  );
  const absolutePath = resolveGatewayPluginPath(pluginFilePath, gatewaysDirectory);
  const pluginName = path.basename(absolutePath, path.extname(absolutePath));
  console.log(`Verifying gateway plugin: ${pluginName}`);
  console.log(`File: ${absolutePath}`);

  const plugin = await describeGatewayPlugin(absolutePath);
  console.log(`Type: ${plugin.type} | ID: ${plugin.id}`);

  const result = await executeGatewayPlugin(absolutePath, plugin);
  if (result.errors.length > 0) {
    console.warn(`Collection errors: ${result.errors.join('; ')}`);
  }
  console.log(`Models returned: ${result.models.length}`);
  if (result.models.length === 0) {
    throw new Error('Plugin returned 0 models. Check its source and registered secrets.');
  }

  const sampleSize = Math.min(5, result.models.length);
  const schemaErrors: string[] = [];
  for (const model of result.models.slice(0, sampleSize)) {
    const parsed = ModelSchema.safeParse(model);
    if (!parsed.success) {
      schemaErrors.push(
        `${model.model_id}: ${parsed.error.errors.map((error) => `${error.path.join('.')}=${error.message}`).join(', ')}`,
      );
    }
  }
  console.log(`Schema validation: ${sampleSize - schemaErrors.length}/${sampleSize} passed`);
  for (const error of schemaErrors) console.log(`Schema note: ${error}`);
  console.log(`PASS: Gateway plugin ${pluginName} is structurally verified.`);
}

const [pluginFilePath] = process.argv.slice(2);
if (!pluginFilePath) {
  console.error('Usage: tsx src/core/verify.ts <path-to-gateway-file>');
  process.exit(1);
}

verify(pluginFilePath).catch((error: unknown) => {
  console.error('Verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
