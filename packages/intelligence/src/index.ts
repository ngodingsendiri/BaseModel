/**
 * @basemodel/intelligence
 *
 * Derived intelligence over canonical registry data.
 * Exposes search, alternatives, and cost heuristics.
 *
 * @see docs/03_Architecture.md
 * @see docs/04_Pipeline.md
 */

export * from './core/engine';
export * from './features/alternatives';
export * from './features/cost';
export * from './features/search';
