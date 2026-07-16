---
name: compare-live-evals
description: >-
  Compare Ollama models on panel chat Level 1 live evals via npm run test:live-eval,
  then write per-model comparison cards to a markdown file under evals/comparisons/.
  Use when the user asks to compare live evals, benchmark models on live scoring,
  or names models to run against Level 1 (e.g. "compare live evals against gemma4:26b
  and medgemma1.5:latest").
---

# Compare Live Evals

Run the same Level 1 live assertions against each named Ollama model and record results in markdown.

## Scope

- **Suite only**: panel chat Level 1 (`server/panelChat.live.eval.test.ts` via `npm run test:live-eval`)
- **Do not** run higher panel levels, unit tests, or change assertion code for a comparison run
- **3 cases** per model (`PANEL_CHAT_LEVEL1_CASES`): `glucose-high`, `all-normal-cbc`, `elevated-tsh-leading`

## Prerequisites

- Local Ollama reachable (`OLLAMA_URL` from `.env`, default `http://localhost:11434`)
- Each named model already pulled in Ollama
- Repo root as cwd

## Workflow

Copy and track:

```
Compare live evals:
- [ ] Parse model names from the user message
- [ ] Confirm Level 1 only (refuse / clarify if they ask for other levels)
- [ ] For each model: run live-eval, capture output + wall-clock
- [ ] Parse pass rate and failing assertion ids
- [ ] Write decision note (1 sentence) per model
- [ ] Write markdown report under evals/comparisons/
- [ ] Tell the user the report path and a one-line summary
```

### 1. Parse models

Extract Ollama model tags from the request (space/`and`/comma-separated). Example:

> compare live evals against gemma4:26b and medgemma1.5:latest

→ `gemma4:26b`, `medgemma1.5:latest`

If none given, ask for at least two model names.

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

- Non-zero exit is **expected** when cases fail — still parse results and continue to the next model
- Do not pass different `--timeout-ms` per model unless the user asks; default suite timeout applies to all
- Shell needs network access to reach Ollama; use a long `block_until_ms` (suite can take many minutes per model)
- Sanitize the log filename (replace `:` and `/` with `-`)

### 3. Parse suite output

From the captured log, prefer the suite summary lines printed in `afterAll`:

```
[live eval] Level 1 pass rate: <passed>/<total> cases
[live eval] failing assertion ids: <case>: [<id>, ...]; ...
```

Rules:

- **Pass rate**: use `passed / 3 cases` (total is always 3 for Level 1). If the summary line is missing, count passed vs failed from per-case lines / vitest results; still report over 3.
- **Failing assertion ids**: copy assertion ids from the summary. If a case failed with multiple ids, include them all. Format as a comma-separated list, optionally prefixed with case id (`glucose-high: mentions-glucose-108`). Use `none` when pass rate is `3 / 3`.
- **Suite wall-clock**: seconds from the timer around that model's `npm run test:live-eval` invocation (not per-case timeout).
- If Ollama/model errors prevent any cases from finishing, still write a card: pass rate `0 / 3` (or however many completed), list what failed, and note the error in the decision sentence.

### 4. Decision note

One sentence only. Compare this model to the run goal (accuracy vs speed, suitability for panel chat). Example patterns:

- "Strong Level 1 accuracy; worth keeping as the default panel model."
- "Fails safety assertions on TSH; too loose for panel chat."
- "Fast but misses in-range acknowledgment; not ready as default."

### 5. Write the markdown report

Create `evals/comparisons/` if needed. Reports there are gitignored by default — do not stage them unless the user asks to commit a decision record (`git add -f`).

Filename:

```
evals/comparisons/level1-<YYYY-MM-DD>-<model1>-vs-<model2>[...].md
```

Sanitize model tags in the filename (`:` → `-`). If more than three models, use `level1-<YYYY-MM-DD>-<N>models.md`.

Report body:

```markdown
# Level 1 live eval comparison

- Date: <ISO date>
- Suite: panel chat Level 1 (`npm run test:live-eval`)
- Cases: glucose-high, all-normal-cbc, elevated-tsh-leading
- Models: <comma-separated list>

## Results

### <model>

Model: <model>

Pass rate: <n> / 3 cases

Failing assertion ids: <ids or none>

Suite wall-clock: <seconds> s

Decision note (1 sentence): <one sentence>

### <next model>

...
```

Use the comparison card fields **exactly** as shown (labels and order). One card section per model, in the order the user listed them.

### 6. Finish

Reply with:

1. Absolute or repo-relative path to the written markdown file
2. Pass rates for each model in one short line
3. Do not paste the full report unless asked

## Anti-patterns

- Do not switch models mid-suite or edit fixtures to make a model pass
- Do not run `npm test` / `verify` as a substitute for live eval
- Do not parallelize model runs (shared Ollama load skews wall-clock and flakiness)
- Do not invent failing assertion ids — only what the suite printed
