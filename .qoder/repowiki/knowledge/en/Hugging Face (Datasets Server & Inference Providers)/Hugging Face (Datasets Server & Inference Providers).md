---
kind: external_dependency
name: Hugging Face (Datasets Server & Inference Providers)
slug: hugging-face
category: external_dependency
category_hints:
    - sdk_real_api
    - auth_protocol
scope:
    - '**'
---

Two Hugging Face endpoints are consumed: (1) the public datasets-server for LMArena Elo rankings and Open LLM Leaderboard scores (optional `BENCHMARKS_FETCH_TOKEN` secret raises rate limits); (2) `https://router.huggingface.co/v1/models` for open-weight model pricing fallback. Without a token, unauthenticated requests share a global rate limit and may return HTTP 429, triggering the Mirror fallback.