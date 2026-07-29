import {
  calculateCostEfficiency,
  findAlternatives,
  IntelligenceEngine,
  searchModels,
} from '@basemodel/intelligence';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
BaseModel CLI — Trusted AI model intelligence

USAGE
  basemodel <command> [options]

COMMANDS
  search    Search models by criteria
  info      Show details for a specific model
  alternatives  List alternative models for a given model

EXAMPLES
  basemodel search --modality image --flag vision_support
  basemodel info openai/gpt-4o
  basemodel alternatives openai/gpt-4o
`);
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}

function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}

function tierColor(tier: string): string {
  if (tier === 'Free') return green(tier);
  if (tier === 'Budget-Friendly') return green(tier);
  if (tier === 'Balanced') return cyan(tier);
  if (tier === 'Premium') return yellow(tier);
  return dim(tier);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdSearch(args: string[]): Promise<void> {
  const engine = new IntelligenceEngine();
  await engine.init();

  const criteria: Parameters<typeof searchModels>[1] = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--provider' && args[i + 1]) {
      criteria.providerIds = args[++i]!.split(',');
    } else if (arg === '--modality' && args[i + 1]) {
      criteria.modalities = args[++i]!.split(',');
    } else if (arg === '--flag' && args[i + 1]) {
      // @ts-expect-error string cast
      criteria.flags = args[++i]!.split(',');
    } else if (arg === '--min-context' && args[i + 1]) {
      criteria.minContextWindow = Number(args[++i]);
    }
  }

  const results = searchModels(engine, criteria);

  if (results.length === 0) {
    console.log('No models found matching the given criteria.');
    return;
  }

  console.log(`\n${bold('Search Results')} — ${results.length} model(s) found\n`);

  for (const model of results) {
    const cost = calculateCostEfficiency(engine, model.model_id);
    const flags: string[] = [];
    if (model.open_weight) flags.push('open-weight');
    if (model.reasoning_support) flags.push('reasoning');
    if (model.function_calling) flags.push('function-calling');
    if (model.vision_support) flags.push('vision');

    console.log(`  ${bold(cyan(model.model_id))}`);
    console.log(`    ${dim('Name:')}    ${model.name}`);
    console.log(`    ${dim('Status:')}  ${model.status}`);
    console.log(
      `    ${dim('Cost:')}    ${tierColor(cost.tier)} ${cost.blendedCost > 0 ? dim(`($${cost.blendedCost.toFixed(3)}/1M blended)`) : ''}`,
    );
    if (flags.length) console.log(`    ${dim('Flags:')}   ${flags.join(', ')}`);
    console.log('');
  }
}

async function cmdInfo(args: string[]): Promise<void> {
  const modelId = args[0];
  if (!modelId) {
    console.error('Usage: basemodel info <model-id>');
    process.exit(1);
  }

  const engine = new IntelligenceEngine();
  await engine.init();

  const model = engine.models.find((m) => m.model_id === modelId);
  if (!model) {
    console.error(`Model not found: ${modelId}`);
    process.exit(1);
  }

  const cost = calculateCostEfficiency(engine, modelId);

  console.log(`\n${bold(cyan(model.model_id))} — ${model.name}\n`);
  console.log(`  ${dim('Provider:')}         ${model.provider_id}`);
  console.log(`  ${dim('Status:')}           ${model.status}`);
  console.log(`  ${dim('Modalities:')}       ${model.modality.join(', ')}`);
  if (model.context_window) {
    console.log(`  ${dim('Context Window:')}   ${model.context_window.toLocaleString()} tokens`);
  }
  if (model.release_date) {
    console.log(`  ${dim('Release Date:')}     ${model.release_date}`);
  }

  console.log(`\n  ${bold('Capabilities')}`);
  console.log(`    Open Weight:       ${model.open_weight ? green('✓') : dim('✗')}`);
  console.log(`    Reasoning:         ${model.reasoning_support ? green('✓') : dim('✗')}`);
  console.log(`    Function Calling:  ${model.function_calling ? green('✓') : dim('✗')}`);
  console.log(`    Structured Output: ${model.structured_output ? green('✓') : dim('✗')}`);
  console.log(`    Vision:            ${model.vision_support ? green('✓') : dim('✗')}`);
  console.log(`    Audio:             ${model.audio_support ? green('✓') : dim('✗')}`);

  console.log(`\n  ${bold('Pricing')}`);
  console.log(`    Tier:             ${tierColor(cost.tier)}`);
  if (cost.blendedCost > 0) {
    console.log(`    Input (1M tok):   $${cost.inputCostPer1M.toFixed(4)}`);
    console.log(`    Output (1M tok):  $${cost.outputCostPer1M.toFixed(4)}`);
    console.log(`    Blended (1M tok): $${cost.blendedCost.toFixed(4)}`);
  }
  console.log('');
}

async function cmdAlternatives(args: string[]): Promise<void> {
  const modelId = args[0];
  if (!modelId) {
    console.error('Usage: basemodel alternatives <model-id>');
    process.exit(1);
  }

  const engine = new IntelligenceEngine();
  await engine.init();

  let results: Awaited<ReturnType<typeof findAlternatives>> | undefined;
  try {
    results = findAlternatives(engine, modelId, 5);
  } catch (_e) {
    console.error(`Model not found: ${modelId}`);
    process.exit(1);
  }

  if (results.length === 0) {
    console.log(`No alternatives found for ${modelId}.`);
    return;
  }

  console.log(`\n${bold('Alternatives')} for ${cyan(modelId)}\n`);

  for (const alt of results) {
    const cost = calculateCostEfficiency(engine, alt.model.model_id);
    console.log(`  ${bold(cyan(alt.model.model_id))}`);
    console.log(`    ${dim('Reason:')} ${alt.reason}`);
    console.log(`    ${dim('Cost:')}   ${tierColor(cost.tier)}`);
    if (alt.model.context_window) {
      console.log(`    ${dim('Context:')} ${alt.model.context_window.toLocaleString()} tokens`);
    }
    console.log('');
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'search':
      await cmdSearch(args);
      break;
    case 'info':
      await cmdInfo(args);
      break;
    case 'alternatives':
      await cmdAlternatives(args);
      break;
    default:
      printUsage();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
