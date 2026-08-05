#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import type { BestModelsCriteria } from '@basemodel/intelligence';
import {
  bestModels,
  buildV2Snapshot,
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
  best      Rank quality-scored models under a budget (Pareto frontier)

EXAMPLES
  basemodel search "gpt-4o" --limit 5
  basemodel search --modality image --flag vision_support
  basemodel info openai/gpt-4o
  basemodel alternatives openai/gpt-4o
  basemodel best --category coding --max-cost 1.0 --limit 5
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

/**
 * Parses `search` command flags into search criteria. Exported for testing.
 */
export function parseSearchCriteria(args: string[]): Parameters<typeof searchModels>[1] {
  const criteria: Parameters<typeof searchModels>[1] = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--provider' && args[i + 1]) {
      criteria.providerIds = args[++i]?.split(',');
    } else if (arg === '--modality' && args[i + 1]) {
      criteria.modalities = args[++i]?.split(',');
    } else if (arg === '--flag' && args[i + 1]) {
      criteria.flags = args[++i]?.split(',') as NonNullable<typeof criteria.flags>;
    } else if (arg === '--min-context' && args[i + 1]) {
      criteria.minContextWindow = Number(args[++i]);
    } else if (arg === '--limit' && args[i + 1]) {
      criteria.limit = Number(args[++i]);
    } else if (arg.startsWith('--')) {
      // Unknown flag: skip it and the value that follows it so stray values
      // are never mistaken for a query.
      i += 1;
    } else if (criteria.query === undefined) {
      // First bare argument is the free-text query.
      criteria.query = arg;
    }
  }

  return criteria;
}

/**
 * Parses `best` command flags into ranking criteria. Exported for testing.
 */
export function parseBestCriteria(args: string[]): BestModelsCriteria {
  const criteria: BestModelsCriteria = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--category' && args[i + 1]) {
      criteria.category = args[++i];
    } else if (arg === '--max-cost' && args[i + 1]) {
      criteria.maxCost = Number(args[++i]);
    } else if (arg === '--min-context' && args[i + 1]) {
      criteria.minContextWindow = Number(args[++i]);
    } else if (arg === '--limit' && args[i + 1]) {
      criteria.limit = Number(args[++i]);
    }
  }

  return criteria;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdSearch(args: string[]): Promise<void> {
  const engine = new IntelligenceEngine();
  await engine.init();

  const criteria = parseSearchCriteria(args);

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
    console.log(
      `  ${dim('Context Window:')}   ${model.context_window.toLocaleString('en-US')} tokens`,
    );
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
      console.log(
        `    ${dim('Context:')} ${alt.model.context_window.toLocaleString('en-US')} tokens`,
      );
    }
    console.log('');
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function cmdBest(args: string[]): Promise<void> {
  const engine = new IntelligenceEngine();
  await engine.init();

  const criteria = parseBestCriteria(args);
  const snapshot = buildV2Snapshot(engine);
  const results = bestModels(snapshot, criteria);

  if (results.length === 0) {
    console.log('No quality-scored models match the given criteria.');
    return;
  }

  const filters: string[] = [];
  if (criteria.category) filters.push(`category=${criteria.category}`);
  if (criteria.maxCost !== undefined) filters.push(`max cost $${criteria.maxCost}/1M`);
  if (criteria.minContextWindow !== undefined) {
    filters.push(`context >= ${criteria.minContextWindow.toLocaleString('en-US')}`);
  }
  console.log(
    `\n${bold('Best models')} ${filters.length ? dim(`(${filters.join(', ')})`) : ''} — ranked by benchmark quality\n`,
  );

  let rank = 0;
  for (const result of results) {
    rank += 1;
    const canonical = result.canonical;
    const pareto = result.pareto_optimal ? ` ${green('◆ pareto-optimal')}` : '';
    console.log(
      `  ${bold(`${rank}.`)} ${bold(cyan(canonical.model_id))} — quality ${canonical.quality?.score ?? '-'} (${canonical.quality?.benchmark_count ?? 0} benchmarks)${pareto}`,
    );
    if (result.offering) {
      const cost =
        result.offering.blended_cost_per_1m !== undefined
          ? `$${result.offering.blended_cost_per_1m.toFixed(3)}/1M blended`
          : result.offering.cost_tier === 'Free'
            ? 'free'
            : 'unpriced';
      console.log(`     ${dim('Cheapest:')} ${result.offering.offering_id} — ${cost}`);
    } else {
      console.log(`     ${dim('Cheapest:')} no priced offering`);
    }
    if (canonical.context_window) {
      console.log(
        `     ${dim('Context:')}  ${canonical.context_window.toLocaleString('en-US')} tokens`,
      );
    }
    console.log('');
  }
}

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
    case 'best':
      await cmdBest(args);
      break;
    default:
      printUsage();
  }
}

// Auto-run only when invoked directly (`basemodel ...`), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
