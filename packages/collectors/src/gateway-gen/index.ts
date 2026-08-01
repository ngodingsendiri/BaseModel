import { readFile } from 'node:fs/promises';
import { healPlugin } from './heal.js';
import { findGateway, getGatewayPluginPath } from './manifest.js';
import { extractShape, probeGateway, readFixture } from './probe.js';
import { checkCollection, generatePlugin, validatePluginModule } from './write.js';

function hasAnySecret(
  gateway: { secrets: string[]; auth?: { secret?: string } },
  env: NodeJS.ProcessEnv,
): boolean {
  const names = [...gateway.secrets];
  if (gateway.auth?.secret) names.push(gateway.auth.secret);
  return names.some((name) => Boolean(env[name]));
}

async function runLiveCheck(gatewayId: string, env: NodeJS.ProcessEnv): Promise<void> {
  const filePath = getGatewayPluginPath(gatewayId);
  const validation = await validatePluginModule(filePath, gatewayId);
  if (!validation.ok || !validation.plugin) {
    console.warn(`  (skip live check: ${validation.errors.join('; ')})`);
    return;
  }
  const check = await checkCollection(validation.plugin, env);
  console.log(
    `  live check : ${check.modelCount} models, ${check.validCount} valid`,
    check.errors.length > 0 ? `| errors: ${check.errors.join(' | ')}` : '',
  );
}

async function bootstrap(gatewayId: string, env: NodeJS.ProcessEnv): Promise<void> {
  const gateway = await findGateway(gatewayId);
  console.log(`Probing ${gateway.id} (${gateway.baseUrl})...`);
  const probe = await probeGateway(gateway, env);
  console.log(
    `  endpoint  : ${probe.endpoint}${probe.fromSample ? ' (from manifest sample)' : ''}`,
  );
  console.log(`  fixture   : ${probe.fixturePath}`);
  console.log(
    `  shape     : ${probe.shape.modelArray ? `model array at "${probe.shape.modelArray.path}" (${probe.shape.modelArray.count} items)` : 'no model array detected'}`,
  );

  console.log(`Generating plugin via LLM...`);
  const generated = await generatePlugin({ gateway, shape: probe.shape, raw: probe.raw, env });
  console.log(`  wrote     : ${generated.filePath} (attempt ${generated.attempts})`);

  if (hasAnySecret(gateway, env)) {
    await runLiveCheck(gateway.id, env);
  } else {
    console.warn(
      `  live check : skipped (no API key in env). The generated plugin was structurally validated; ` +
        'add a fixture-based unit test or set the gateway key to verify mapping.',
    );
  }
}

async function heal(gatewayId: string, env: NodeJS.ProcessEnv, errorsFile?: string): Promise<void> {
  const gateway = await findGateway(gatewayId);
  const raw = await readFixture(gatewayId);
  const shape = extractShape(raw);
  let errors: string[] = [];
  if (errorsFile) {
    const parsed = JSON.parse(await readFile(errorsFile, 'utf-8')) as unknown;
    errors = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  }
  console.log(`Healing plugin for ${gateway.id}...`);
  const healed = await healPlugin({ gateway, shape, raw, errors, env });
  console.log(`  wrote     : ${healed.filePath} (attempt ${healed.attempts})`);
  if (hasAnySecret(gateway, env)) await runLiveCheck(gateway.id, env);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const gatewayId = args.find((arg) => !arg.startsWith('--'));
  if (!gatewayId) {
    console.error('Usage: tsx src/gateway-gen/index.ts <gateway-id> [--heal] [--errors <file>]');
    process.exit(1);
  }
  const env = process.env;
  try {
    if (args.includes('--heal')) {
      const errorsIndex = args.indexOf('--errors');
      const errorsFile = errorsIndex >= 0 ? args[errorsIndex + 1] : undefined;
      await heal(gatewayId, env, errorsFile);
    } else {
      await bootstrap(gatewayId, env);
    }
  } catch (error: unknown) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
