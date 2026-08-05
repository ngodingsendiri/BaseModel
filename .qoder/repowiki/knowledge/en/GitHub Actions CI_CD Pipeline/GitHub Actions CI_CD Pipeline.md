---
kind: external_dependency
name: GitHub Actions CI/CD Pipeline
slug: github-actions
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

Nightly collection and dataset regeneration are driven by GitHub Actions workflows (`ci.yml`, `collect.yml`, `publish.yml`, `deploy-pages.yml`, `verify-gateway.yml`). Secrets such as `BENCHMARKS_FETCH_TOKEN` are injected into the benchmark step; the collect workflow performs git rebase conflict resolution against main before committing registry changes.