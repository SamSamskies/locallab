# LocalLab

A privacy-first, fully-local web app for analyzing blood work results. Upload a lab PDF, extract structured markers with a local Ollama LLM, store results in SQLite, and view insights and trends.

![LocalLab web UI](docs/screenshot-20260717.png)

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Ollama](https://ollama.com) running locally with at least one model pulled (e.g. `ollama pull gemma4:26b`)

## Setup

```bash
cp .env.example .env
npm install
npm run db:push
```

## Database backup

```bash
npm run db:backup
```

Creates a timestamped copy of `data/app.db` under `data/backups/`.

## Development

```bash
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:3001

## Production

```bash
npm run build
npm start
```

- App: http://localhost:3001 (API and web UI on one port)

## Verify

```bash
npm run verify
```

Runs TypeScript type-checking (`tsc --noEmit`) and unit tests (canned graders only — no Ollama calls).

## Live evals

Panel, trend, and extract Level 1 live scoring hit your local Ollama model and are **not** part of `npm test` / `npm run verify`. Requires Ollama running and `OLLAMA_MODEL` set (via `.env` or `--model`). Use `--suite panel|trend|extract|all` (default `all` = panel + trend; extract is opt-in).

```bash
npm run test:live-eval -- --suite panel --model gemma4:26b
npm run test:live-eval -- --suite trend --model gemma4:26b
npm run test:live-eval -- --suite extract --model gemma4:26b-mlx
npm run test:live-eval -- --suite extract --model gemma4:26b-mlx --temperature 0
npm run test:live-eval -- --suite extract --model gemma4:26b-mlx --think true
npm run test:live-eval -- --suite panel --model gemma4:26b-mlx --think true
npm run test:live-eval -- --model qwen3.6:27b --timeout-ms 1200000
npm run test:live-eval -- --suite panel --model gemma4:26b-mlx --trials 3
```

On failure, the suite logs failing assertion ids and the raw model answer for each case (JSON for extract). `--trials` / `-k` (or `LOCALLAB_LIVE_EVAL_TRIALS`) repeats the full suite for pass^k; default is `1` (baselines / compares). Ship gate uses `3`. `--think` is flag-only (not inherited from `.env`) and applies to panel, trend, and extract; `--temperature` is extract-only. Production chat and extraction both set `think: false` (temperature unset on extract); omit the flags to match that path.

### Baselines and model comparisons

- **Baseline** (one model; suite `panel`, `trend`, `extract`, or `all` → panel + trend files): ask Cursor with the `baseline-live-evals` skill, e.g. “baseline trend on gemma4:26b”, “baseline extract on gemma4:26b-mlx”, or “baseline all on gemma4:26b-mlx”. Reports go to `evals/baselines/`.
- **Compare** (same suite, multiple models): ask with `compare-live-evals`, e.g. “compare trend live evals against gemma4:26b and medgemma1.5:latest” (suite defaults to panel if omitted). Reports go to `evals/comparisons/`.

Both report dirs are gitignored by default; force-add only when committing a decision record.

### Ship gate (pass^k)

Chat and extract are **separate** rituals. Do not average them or require one because the other is in the PR.

Do not ship a LocalLab chat model default or prompt change unless panel Level 1 and trend Level 1 both clear pass^k (start k = 3) on that exact model tag.

Do not ship an extraction prompt or JSON harness change (including `think` / temperature / `format`) unless extract Level 1 clears pass^k (start k = 3) on that exact model tag.

```bash
npm run test:live-eval -- --suite panel --model gemma4:26b-mlx --trials 3
npm run test:live-eval -- --suite trend --model gemma4:26b-mlx --trials 3
npm run test:live-eval -- --suite extract --model gemma4:26b-mlx --trials 3
```

Chat and extract gate runs must omit `--think` (and extract must also omit `--temperature`) so they match production (`think: false`; extract temperature unset). Ask Cursor with the `ship-gate-live-evals` skill. Gate tag must match `.env` `OLLAMA_MODEL` (local default: `gemma4:26b-mlx`); document any one-line override in the PR. Do not average suites, skip a gated suite, or ship on pass@1 folklore.

### Chat think default (#11)

Extraction and auto-generated trend insights always send top-level `think: false`. Panel/trend chat defaults to `think: false` too; toggle **reasoning** with the brain icon in the chat composer. Preference lives in SQLite `app_settings` with the selected model. The Model reasoning panel only appears when reasoning is on and the model streams thinking deltas. Non-thinking models ignore the flag. A/B with `--think true` on live evals if revisiting.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_TIMEOUT_MS` | `0` | Idle timeout while streaming Ollama tokens; `0` disables the limit |
| `OLLAMA_MODEL` | — | Model for live evals (`npm run test:live-eval`); override with `--model` |
| `LOCALLAB_LIVE_EVAL` | `0` | Keep `0` for normal use; `test:live-eval` sets this to `1` |
| `LOCALLAB_LIVE_EVAL_TIMEOUT_MS` | `900000` | Per-case live-eval timeout in ms; override with `--timeout-ms` |
| `LOCALLAB_LIVE_EVAL_TRIALS` | `1` | Independent full-suite repeats for pass^k; override with `--trials` / `-k` (ship gate: `3`) |
| `PORT` | `3001` | Express API port |

Choose a model from the web UI before uploading or generating insights.
