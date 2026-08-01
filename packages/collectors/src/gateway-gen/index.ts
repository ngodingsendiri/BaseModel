import { readFile } from 'node:fs/promises';
import { healPlugin } from './heal.js';
import { findGateway } from './manifest.js';
import { extractShape, probeGateway, readFixture } from './probe.js';
import { generatePlugin } from './write.js';

function hasAnySecret(
  gateway: { secrets: string[]; auth?: { secret?: string } },
  env: NodeJS.ProcessEnv,
): boolean {
  const names = [...gateway.secrets];
  if (gateway.auth?.secret) names.push(gateway.auth.secret);
  return names.some((name) => Boolean(env[name]));
}

function liveSecretsFor(
  gateway: { secrets: string[]; auth?: { secret?: string } },
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> | undefined {
  return hasAnySecret(gateway, env) ? env : undefined;
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

  const liveSecrets = liveSecretsFor(gateway, env);
  console.log(`Generating plugin via LLM...`);
  const generated = await generatePlugin({
    gateway,
    shape: probe.shape,
    raw: probe.raw,
    env,
    liveSecrets,
  });
  console.log(`  wrote     : ${generated.filePath} (attempt ${generated.attempts})`);
  if (!liveSecrets) {
    console.warn(
      `  live check : skipped (no API key in env). The generated plugin was validated for structure and types; ` +
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
  const healed = await healPlugin({
    gateway,
    shape,
    raw,
    errors,
    env,
    liveSecrets: liveSecretsFor(gateway, env),
  });
  console.log(`  wrote     : ${healed.filePath} (attempt ${healed.attempts})`);
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
