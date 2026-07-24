---
name: ship-gate-live-evals
description: >-
  Dual-suite (panel + trend) Level 1 live-eval acceptance gate before shipping
  chat default model, prompt/guidance, or harness changes that alter what
  production sends the model. Requires pass^k (default k = 3) on each suite.
  Use when the user asks to run the ship gate, accept a chat default, or paste
  the one-sentence ship rule into a PR.
---

# Ship Gate: Dual-Suite Live Evals

Intentional ship ritual — not every-commit CI. Offline canned tests stay in `npm test`; live Level 1 stays gated. Clearing the gate means **pass^k**, not a single lucky green.

## When to run

Use this gate when you would:

- Change the user-facing chat default model
- Ship a prompt / guidance change
- Merge a harness change that alters what production sends the model

## Ship rule (paste into PR / checklist)

> Do not ship a LocalLab chat model default or prompt change unless panel Level 1 and trend Level 1 both clear pass^k (start k = 3) on that exact model tag.

## Prerequisites

- Ollama up; model tag already pulled
- Gate model **must** match production config: `OLLAMA_MODEL` in `.env` (local default: `gemma4:26b-mlx`). A green run on a different pull is not the gate. If overriding, document the one-line override in the PR.
- Repo root as cwd
- Trial budget **k** (default **3**): each suite must pass `k` independent full runs (`--trials k` / `LOCALLAB_LIVE_EVAL_TRIALS`)

## Workflow

```
Ship gate live evals:
- [ ] Confirm trigger (default model / prompt / production harness)
- [ ] Confirm gate tag === .env OLLAMA_MODEL (or document override)
- [ ] Confirm k (default 3) — pass^k, not pass@1
- [ ] Panel Level 1 with --trials k on that exact tag → expect k/k trial clears (each 3/3)
- [ ] Trend Level 1 with --trials k on that exact tag → expect k/k trial clears (each 4/4; separate score; do not average)
- [ ] If any trial fails: triage (true fail vs grader FP vs flake) before product “fixes”
- [ ] Do not ship on a partial trial streak or a single lucky green
- [ ] Paste ship rule into PR; link both multi-trial logs / report paths
```

### Run

Default ship budget is **k = 3**. Run panel and trend as **separate** suite passes (do not blend):

```bash
npm run test:live-eval -- --suite panel --model "<exact-tag>" --trials 3
npm run test:live-eval -- --suite trend --model "<exact-tag>" --trials 3
```

Equivalent env form: `LOCALLAB_LIVE_EVAL_TRIALS=3`.

Expect launcher lines `pass^3 cleared: suite=panel` and `pass^3 cleared: suite=trend` (each trial itself full suite green: panel **3 / 3**, trend **4 / 4**). Optionally also write baseline-style reports under `evals/baselines/` after a clear if you want a durable record — the gate itself is the multi-trial exit codes + `pass^k cleared` lines.

Override k only when the user asks (e.g. `--trials 5`); start at 3.

### Failures

1. Triage before changing product code: true fail vs grader false positive vs flake
2. Flakes: keep or raise k, or harden the assert — do not ship on pass@1 luck
3. Enlarging a gated suite (e.g. promoting a new Level 1 case) invalidates prior clears — re-run full dual pass^k before the next chat-default ship
4. A fail on trial `i` aborts remaining trials for that suite; re-run the full `--trials k` after triage — do not stitch partial greens into a fake pass^k

## Anti-patterns

- Do not average panel + trend into one score
- Do not skip panel because trend just passed (or the reverse)
- Do not treat `npm test` / `verify` as this gate
- Do not silently substitute a different Ollama tag
- Do not ship on pass@1 folklore when the ritual requires pass^k
- Do not count “2 of 3 trials green” as a clear
