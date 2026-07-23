---
name: ship-gate-live-evals
description: >-
  Dual-suite (panel + trend) Level 1 live-eval acceptance gate before shipping
  chat default model, prompt/guidance, or harness changes that alter what
  production sends the model. Use when the user asks to run the ship gate,
  accept a chat default, or paste the one-sentence ship rule into a PR.
---

# Ship Gate: Dual-Suite Live Evals

Intentional ship ritual — not every-commit CI. Offline canned tests stay in `npm test`; live Level 1 stays gated.

## When to run

Use this gate when you would:

- Change the user-facing chat default model
- Ship a prompt / guidance change
- Merge a harness change that alters what production sends the model

## Ship rule (paste into PR / checklist)

> Before merging a chat default, prompt/guidance, or production-harness change: both Level 1 suites must pass separately on the exact production Ollama tag (`npm run test:live-eval -- --suite panel` then `--suite trend`); do not average scores, skip a suite, or ship on a single lucky green — triage true fail vs grader FP vs flake first, and prefer pass^k over pass@1.

## Prerequisites

- Ollama up; model tag already pulled
- Gate model **must** match production config: `OLLAMA_MODEL` in `.env` (local default: `gemma4:26b-mlx`). A green run on a different pull is not the gate. If overriding, document the one-line override in the PR.
- Repo root as cwd

## Workflow

```
Ship gate live evals:
- [ ] Confirm trigger (default model / prompt / production harness)
- [ ] Confirm gate tag === .env OLLAMA_MODEL (or document override)
- [ ] Baseline panel on that exact tag → expect 3/3
- [ ] Baseline trend on that exact tag → expect 3/3 (separate score; do not average)
- [ ] If any suite fails: triage (true fail vs grader FP vs flake) before product “fixes”
- [ ] Flakes → raise trial budget or harden assert; do not ship on pass@1 luck
- [ ] Paste ship rule into PR; link both baseline report paths
```

### Run

Follow `baseline-live-evals` with suite `all` (two passes, two reports):

```bash
npm run test:live-eval -- --suite panel --model "<exact-tag>"
npm run test:live-eval -- --suite trend --model "<exact-tag>"
```

Expect two files under `evals/baselines/`, each **3 / 3**.

### Failures

1. Triage before changing product code: true fail vs grader false positive vs flake
2. Flakes: raise trial budget or harden the assert — pass^k matters more than pass@1 for chat defaults
3. Do **not** add the banked flat/stable case mid-gate unless triage shows invented movement

## Anti-patterns

- Do not average panel + trend into one score
- Do not skip panel because trend just passed (or the reverse)
- Do not treat `npm test` / `verify` as this gate
- Do not silently substitute a different Ollama tag
- Do not ship on a single lucky green when the suite has flaked
