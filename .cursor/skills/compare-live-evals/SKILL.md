---
name: compare-live-evals
description: >-
  Compare Ollama models on panel chat Level 1 live evals via
  npm run test:live-eval, then write per-run comparison cards to a markdown file
  under evals/comparisons/. Use when the user asks to compare live evals,
  benchmark models on live scoring, or names models to run against Level 1
  (e.g. "compare live evals against gemma4:26b and medgemma1.5:latest").
---

# Compare Live Evals

Run the same Level 1 live assertions against each named model and record results in markdown.

## Scope

- **Suite only**: panel chat Level 1 (`server/panelChat.live.eval.test.ts` via `npm run test:live-eval`)
- **Do not** run higher panel levels, unit tests, or change assertion code for a comparison run
- **3 cases** per run (`PANEL_CHAT_LEVEL1_CASES`): `glucose-high`, `all-normal-cbc`, `elevated-tsh-leading`
- **Prompt**: production chat guidance only (no prompt-variant flag). If the user asks to A/B prompts, say variants are not wired—compare models, or add a new variant first.

## Prerequisites

- Local Ollama reachable (`OLLAMA_URL` from `.env`, default `http://localhost:11434`)
- Each named model already pulled in Ollama
- Repo root as cwd

## Workflow

Copy and track:

```
Compare live evals:
- [ ] Parse models from the user message
- [ ] Confirm Level 1 only (refuse / clarify if they ask for other levels)
- [ ] For each model: live-eval with --model, capture output + wall-clock
- [ ] Parse pass rate, failing assertion ids, and raw model answers per case
- [ ] Write decision note (1 sentence) per run
- [ ] Write markdown report under evals/comparisons/ (include model responses)
- [ ] Tell the user the report path and a one-line summary
```

### 1. Parse runs

Each **run** is one model (production prompt).

**Models** (space/`and`/comma-separated):

> compare live evals against gemma4:26b and medgemma1.5:latest

→ `gemma4:26b`, `medgemma1.5:latest`

If the user names fewer than two models, ask for at least two. If they ask for prompt A/B, refuse and explain production guidance is the only chat prompt right now.

### 2. Run each model (same assertions)

For **each** model, sequentially:

```bash
# Record wall-clock around the suite (seconds, one decimal ok)
START=$(date +%s)
npm run test:live-eval -- --model "<model>" 2>&1 | tee "/tmp/locallab-live-eval-<safe-model>.log"
END=$(date +%s)
echo "SUITE_WALL_CLOCK_S=$((END - START))"
```

Notes:

- Non-zero exit is **expected** when cases fail — still parse results and continue to the next run
- Do not pass different `--timeout-ms` per run unless the user asks; default suite timeout applies to all
- Shell needs network access to reach Ollama; use a long `block_until_ms` (suite can take many minutes per run)
- Sanitize the log filename (replace `:` and `/` with `-`)

### 3. Parse suite output

From the captured log, prefer the suite summary lines printed in `afterAll`:

```
[live eval] Level 1 pass rate: <passed>/<total> cases
[live eval] failing assertion ids: <case>: [<id>, ...]; ...
[live eval] raw answer begin case=<case-id>
<full model reply>
[live eval] raw answer end case=<case-id>
```

Also note the launcher line: `[live-eval] model=... timeoutMs=...`

Rules:

- **Pass rate**: use `passed / 3 cases` (total is always 3 for Level 1). If the summary line is missing, count passed vs failed from per-case lines / vitest results; still report over 3.
- **Failing assertion ids**: copy assertion ids from the summary. If a case failed with multiple ids, include them all. Format as a comma-separated list, optionally prefixed with case id (`glucose-high: mentions-glucose-108`). Use `none` when pass rate is `3 / 3`.
- **Model responses**: for **every completed case**, extract the text between `raw answer begin case=<id>` and `raw answer end case=<id>` (inclusive markers not copied). Include **all** cases (pass and fail) — failing assertion ids alone are not enough for grader triage. If a case never finished, omit it and note the error in the decision sentence.
- **Suite wall-clock**: seconds from the timer around that run's `npm run test:live-eval` invocation (not per-case timeout).
- If Ollama/model errors prevent any cases from finishing, still write a card: pass rate `0 / 3` (or however many completed), list what failed, and note the error in the decision sentence.

### 4. Decision note

One sentence only. Compare this run to the goal (accuracy vs speed, suitability for panel chat). Example patterns:

- "Strong Level 1 accuracy; worth keeping as the default panel model."
- "Fails safety assertions on TSH; too loose for panel chat."
- "Matches peer accuracy at lower wall-clock; strong speed pick if tone is acceptable."

### 5. Write the markdown report

Create `evals/comparisons/` if needed. Reports there are gitignored by default — do not stage them unless the user asks to commit a decision record (`git add -f`).

Filename (local time when the report is written, after the last run finishes):

```
evals/comparisons/level1-<YYYY-MM-DD>-<HHMMSS>-<slug>.md
```

- **Timestamp**: `HHMMSS` (24h, zero-padded) so same-day comparisons sort in run order and do not collide
- **Slug**: `<model1>-vs-<model2>[...]`, or `<N>runs` when more than three models
- Sanitize model tags (`:` → `-`). Example: `level1-2026-07-16-161130-gemma4-26b-vs-medgemma1.5-latest.md`

Report body (example uses five-backtick outer fence so inner four-backtick answer fences stay intact):

`````markdown
# Level 1 live eval comparison

- Date: <YYYY-MM-DD HH:MM:SS local>
- Suite: panel chat Level 1 (`npm run test:live-eval`)
- Cases: glucose-high, all-normal-cbc, elevated-tsh-leading
- Runs: <model>, ...

## Results

### <model>

Model: <model>

Pass rate: <n> / 3 cases

Failing assertion ids: <ids or none>

Suite wall-clock: <seconds> s

Decision note (1 sentence): <one sentence>

Model responses:

#### <case-id>

````
<full model reply for this case>
````

#### <next-case-id>

````
...
````

### <next run>

...
`````

Use the same local clock for the filename timestamp and the `Date:` line. Use the comparison card fields **exactly** as shown (labels and order). One card section per run, in the order the user listed them.

**Model responses** (required for triage):

- Under each run card, after the decision note, add `Model responses:` then one `#### <case-id>` subsection per completed case (same order as Cases: glucose-high, all-normal-cbc, elevated-tsh-leading)
- Paste the **full** raw reply from the log markers — do not summarize or truncate
- Wrap each reply in a four-backtick fence so markdown inside the model reply does not break the report; if the reply itself contains four-backtick fences, use a longer fence
- Do not invent replies — only text captured between the begin/end markers for that run

### 6. Finish

Reply with:

1. Absolute or repo-relative path to the written markdown file
2. Pass rates for each run in one short line
3. Do not paste the full report unless asked

## Anti-patterns

- Do not switch models mid-suite or edit fixtures to make a model pass
- Do not invent a prompt-variant flag for the comparison — production guidance only
- Do not run `npm test` / `verify` as a substitute for live eval
- Do not parallelize runs (shared Ollama load skews wall-clock and flakiness)
- Do not invent failing assertion ids — only what the suite printed
- Do not invent or paraphrase model responses — only paste from begin/end markers
- Do not omit model responses from the report when answers were logged (needed for grader triage)
