---
name: ship-gate-live-evals
description: >-
  Level 1 live-eval acceptance gates before shipping. Chat: panel + trend
  pass^k (default k = 3) for chat default model, prompt/guidance, or chat
  harness changes. Extract: extract pass^k for extraction prompt or JSON
  harness changes (think, temperature, format, fence parse). Use when the
  user asks to run the ship gate, accept a chat default, accept an extract
  harness change, or paste the ship rule into a PR.
---

# Ship Gate: Live Evals

Intentional ship ritual — not every-commit CI. Offline canned tests stay in `npm test`; live Level 1 stays gated. Clearing a gate means **pass^k**, not a single lucky green.

Two independent rituals. Never average them. Never require chat because extract is in the PR, or the reverse.

## When to run

**Chat gate** when you would:

- Change the user-facing chat default model
- Ship a chat prompt / guidance change
- Merge a chat harness change that alters what production sends the model (including `think`)

**Extract gate** when you would:

- Ship an extraction prompt or schema change
- Merge a JSON harness change that alters extraction (`think`, temperature, `format`, fence stripping in `chatJsonStreaming`)

A PR that only changes chat does not need extract pass^k. A PR that only changes extraction does not need panel + trend pass^k.

## Ship rules (paste into PR / checklist)

Chat:

> Do not ship a LocalLab chat model default or prompt change unless panel Level 1 and trend Level 1 both clear pass^k (start k = 3) on that exact model tag.

Extract:

> Do not ship an extraction prompt or JSON harness change (including `think` / temperature / `format`) unless extract Level 1 clears pass^k (start k = 3) on that exact model tag.

## Prerequisites

- Ollama up; model tag already pulled
- Gate model **must** match production config: `OLLAMA_MODEL` in `.env` (local default: `gemma4:26b-mlx`). A green run on a different pull is not the gate. If overriding, document the one-line override in the PR.
- Repo root as cwd
- Trial budget **k** (default **3**): the gated suite(s) must pass `k` independent full runs (`--trials k` / `LOCALLAB_LIVE_EVAL_TRIALS`)
- Chat and extract gates run the **production** path: omit `--think` (production sets `think: false` on chat and extract). Extract also omits `--temperature` (production leaves it unset)

## Workflow

```
Ship gate live evals:
- [ ] Confirm trigger (chat vs extract vs both)
- [ ] Confirm gate tag === .env OLLAMA_MODEL (or document override)
- [ ] Confirm k (default 3) — pass^k, not pass@1
- [ ] Chat trigger: panel Level 1 with --trials k → k/k trial clears (each 3/3)
- [ ] Chat trigger: trend Level 1 with --trials k → k/k trial clears (each 4/4; separate score; do not average)
- [ ] Chat trigger: omit --think on panel and trend (production think: false)
- [ ] Extract trigger: extract Level 1 with --trials k → k/k trial clears (each 2/2); omit --think / --temperature
- [ ] If any trial fails: triage (true fail vs grader FP vs flake) before product “fixes”
- [ ] Do not ship on a partial trial streak or a single lucky green
- [ ] Paste the matching ship rule(s) into PR; link multi-trial logs / report paths
```

### Run

Default ship budget is **k = 3**. Run each gated suite as a **separate** pass (do not blend):

```bash
# Chat gate
npm run test:live-eval -- --suite panel --model "<exact-tag>" --trials 3
npm run test:live-eval -- --suite trend --model "<exact-tag>" --trials 3

# Extract gate (production think: false — do not pass --think / --temperature)
npm run test:live-eval -- --suite extract --model "<exact-tag>" --trials 3
```

Do not pass `--think` on chat or extract gate runs (must match production `think: false`).

Equivalent env form: `LOCALLAB_LIVE_EVAL_TRIALS=3`.

Expect launcher lines `pass^3 cleared: suite=panel`, `pass^3 cleared: suite=trend`, and/or `pass^3 cleared: suite=extract` (each trial itself full suite green: panel **3 / 3**, trend **4 / 4**, extract **2 / 2**). Optionally also write baseline-style reports under `evals/baselines/` after a clear if you want a durable record — the gate itself is the multi-trial exit codes + `pass^k cleared` lines.

Override k only when the user asks (e.g. `--trials 5`); start at 3.

### Failures

1. Triage before changing product code: true fail vs grader false positive vs flake
2. Flakes: keep or raise k, or harden the assert — do not ship on pass@1 luck
3. Enlarging a gated suite (e.g. promoting a new Level 1 case) invalidates prior clears for **that** gate — re-run that gate’s full pass^k before the next matching ship (chat-default ship if panel/trend grew; extract-harness ship if extract grew)
4. A fail on trial `i` aborts remaining trials for that suite; re-run the full `--trials k` after triage — do not stitch partial greens into a fake pass^k

## Anti-patterns

- Do not average panel + trend + extract into one score
- Do not skip panel because trend just passed (or the reverse)
- Do not fold extract into the chat dual-suite, or require chat suites for an extract-only change
- Do not pass `--think` on a chat or extract gate run (must match production `think: false`)
- Do not pass `--temperature` on an extract gate run (must match production)
- Do not treat `npm test` / `verify` as this gate
- Do not silently substitute a different Ollama tag
- Do not ship on pass@1 folklore when the ritual requires pass^k
- Do not count “2 of 3 trials green” as a clear
