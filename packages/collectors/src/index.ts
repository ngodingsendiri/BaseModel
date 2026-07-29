/**
 * @basemodel/collectors
 *
 * Discovery layer for BaseModel. Contains provider-specific collectors
 * that discover and retrieve AI model metadata from external sources.
 *
 * Each collector is a plugin that implements a standard interface:
 * - discover(): Find new or updated resources
 * - collect(): Retrieve raw data from the source
 *
 * Maps to the Architecture's "Discovery Layer" and the Pipeline's
 * Discovery and Collection stages.
 *
 * @see docs/03_Architecture.md — Discovery Layer
 * @see docs/04_Pipeline.md — Stages 1, 2
 */

export {};
