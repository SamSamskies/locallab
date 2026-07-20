---
name: baseline-live-evals
description: >-
  Run a single-model Level 1 live eval baseline via npm run test:live-eval
  (--suite panel|trend|all), then write triage report(s) under evals/baselines/
  with pass rate, per-case wall time, and full transcripts. Use when the user
  asks for a live-eval baseline, first-pass scoring on one model, or to record
  a reference run (e.g. "baseline trend on gemma4:26b" or "baseline all on
  gemma4:26b-mlx").
---

# Baseline Live Evals

Capture one Level 1 live-eval run (one suite, one model) as a markdown baseline for triage and later comparison.

## Scope

- **One suite per report**: `panel` or `trend` (require an explicit `--suite` on each vitest invocation; never pass launcher `all` as one blended process)
- **One model** per report
- When the user asks for suite `all`: run panel then trend as **two separate** suite passes and write **two** reports — never one blended pass rate
- **Do not** run multi-model A/B here — use `compare-live-evals` (writes to `evals/comparisons/`)
- **Do not** change assertion code or fixtures to make the model pass
- **Prompt**: production chat guidance only

### Suites

| Suite | Flag | Cases (always 3) |
| :--- | :--- | :--- |
| panel | `--suite panel` | `glucose-high`, `all-normal-cbc`, `elevated-tsh-leading` |
| trend | `--suite trend` | `ldl-rising`, `triglycerides-falling`, `cholesterol-leading` |
| all | (two passes) | panel cases, then trend cases — two report files |

## Prerequisites

- Local Ollama reachable (`OLLAMA_URL` from `.env`, default `http://localhost:11434`)
- Named model already pulled (if the exact tag 404s, check `ollama list` and ask before substituting)
- Repo root as cwd

## Workflow

Copy and track:

```
Baseline live eval:
- [ ] Parse suite (panel|trend|all) and model from the user message
- [ ] Confirm Level 1 only (refuse / clarify if they ask for other levels)
- [ ] For each suite in scope: live-eval with --suite and --model; capture output + suite wall-clock
- [ ] Parse pass rate, failing ids, per-case wall times, raw answers
- [ ] Write decision note (1 sentence) + short triage bullets per suite
- [ ] Write markdown under evals/baselines/ (one file per suite)
- [ ] Tell the user the report path(s) and a one-line summary
```

### 1. Parse request

Examples:

> baseline trend on gemma4:26b  
> baseline panel chat Level 1 with medgemma1.5:latest  
> first trend baseline gemma4:26b-mlx  
> baseline all on gemma4:26b-mlx

Require **suite** + **model**. If either is missing, ask. Suite `all` expands to `[panel, trend]`. If the user names two+ models, point them at `compare-live-evals` (or offer one baseline per model as separate reports).

### 2. Run the suite

For **each** suite in scope (`panel` / `trend`, or both when `all`):

```bash
START=$(date +%s)
npm run test:live-eval -- --suite "<panel|trend>" --model "<model>" 2>&1 | tee "/tmp/locallab-live-eval-baseline-<suite>-<safe-model>.log"
END=$(date +%s)
echo "SUITE_WALL_CLOCK_S=$((END - START))"
```

Notes:

- Non-zero exit is **expected** when cases fail — still parse and write the report
- Do not change `--timeout-ms` unless the user asks
- Shell needs network access to Ollama; use a long `block_until_ms` (many minutes)
- Sanitize the log filename (`:` / `/` → `-`)
- Do not parallelize suite passes (shared Ollama load skews wall-clock)

### 3. Parse suite output

Prefer `afterAll` summary lines:

```
[live eval] Level 1 pass rate: <passed>/<total> cases
[live eval] failing assertion ids: <case>: [<id>, ...]; ...
[live eval] raw answer begin case=<case-id>
<full model reply>
[live eval] raw answer end case=<case-id>
```

Also note launcher: `[live-eval] suite=... model=... timeoutMs=...`

**Per-case wall time** — from Vitest lines, e.g.:

```
✓ trend chat Level 1 live > 'ldl-rising'  18042ms
```

Report seconds to one decimal (`18.0 s`). If a case never finished, omit wall time and note the error in triage.

Rules:

- **Pass rate**: `passed / 3 cases` (Level 1 total is always 3)
- **Failing assertion ids**: from the summary; `none` when `3 / 3`
- **Model responses**: every completed case between begin/end markers (pass and fail); do not invent or truncate
- **Suite wall-clock**: seconds around the `npm run test:live-eval` invocation

### 4. Decision note + triage

- **Decision note**: one sentence on fitness as a reference / default for that suite
- **Triage**: one short bullet per case — pass/fail, what held or which assertion pressure broke (cite ids when failing)

### 5. Write the markdown report

Create `evals/baselines/` if needed. Reports are gitignored by default — do not stage unless the user asks (`git add -f`).

Filename (local time when **that suite’s** report is written):

```
evals/baselines/<suite>-level1-<YYYY-MM-DD>-<HHMMSS>-<model-slug>.md
```

- **Suite prefix**: `panel` or `trend` (one suite per file)
- **Timestamp**: `HHMMSS` (24h, zero-padded); when suite is `all`, stamp each file when that suite finishes
- **Model slug**: sanitize (`:` → `-`). Example: `trend-level1-2026-07-20-084549-gemma4-26b-mlx.md`

Report body (five-backtick outer fence so inner four-backtick answer fences stay intact):

`````markdown
# <Panel|Trend> chat Level 1 live eval baseline

- Date: <YYYY-MM-DD HH:MM:SS local>
- Suite: <panel|trend> chat Level 1 (`npm run test:live-eval -- --suite <suite>`)
- Cases: <case list for suite>
- Model: <model>

## Results

### <model>

Model: <model>

Pass rate: <n> / 3 cases

Failing assertion ids: <ids or none>

Suite wall-clock: <seconds> s

Per-case wall time:

| Case | Wall time | Result |
| :--- | ---: | :--- |
| <case-id> | <s> s | pass \| fail |
| ... | ... | ... |

Decision note (1 sentence): <one sentence>

### Triage

- **<case-id>**: <short triage>
- ...

Model responses:

#### <case-id>

````
<full model reply>
````

#### <next-case-id>

````
...
````
`````

Use the same local clock for filename timestamp and `Date:`. Keep field labels/order exactly as shown. Paste full replies from begin/end markers only.

### 6. Finish

Reply with:

1. Path(s) to the written markdown file(s)
2. Pass rate + suite wall-clock in one short line (prefix with suite when reporting `all`)
3. Do not paste the full report unless asked

## Anti-patterns

- Do not write baselines under `evals/comparisons/`
- Do not omit `--suite` or pass launcher `all` as one vitest process (mixes panel + trend)
- Do not blend panel and trend into one pass rate or one undivided report
- Do not run `npm test` / `verify` as a substitute for live eval
- Do not invent failing assertion ids or paraphrase model responses
- Do not omit model responses when answers were logged
- Do not substitute a different Ollama tag silently when the requested model 404s — ask first
