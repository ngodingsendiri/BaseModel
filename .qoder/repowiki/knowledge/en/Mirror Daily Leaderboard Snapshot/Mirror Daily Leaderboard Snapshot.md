---
kind: external_dependency
name: Mirror Daily Leaderboard Snapshot
slug: mirror-leaderboard
category: external_dependency
category_hints:
    - migration_status
scope:
    - '**'
source_files:
    - data/registry/benchmarks/mirror.json
---

A daily text/code leaderboard snapshot hosted on GitHub raw files serves as the fallback when LMArena or Open LLM Leaderboard are unreachable/rate-limited. It ensures ranked data still emits on a degraded path even without any API keys.