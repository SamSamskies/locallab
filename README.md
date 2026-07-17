# LocalLab

A privacy-first, fully-local web app for analyzing blood work results. Upload a lab PDF, extract structured markers with a local Ollama LLM, store results in SQLite, and view insights and trends.

![LocalLab web UI](docs/screenshot.png)

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Ollama](https://ollama.com) running locally with at least one model pulled (e.g. `ollama pull llama3.2`)

## Setup

```bash
cp .env.example .env
npm install
npm run db:push
```

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

Panel-chat Level 1 live scoring hits your local Ollama model and is **not** part of `npm test` / `npm run verify`. Requires Ollama running and `OLLAMA_MODEL` set (via `.env` or `--model`).

```bash
npm run test:live-eval
npm run test:live-eval -- --model llama3.2
npm run test:live-eval -- --model qwen3.6:27b --timeout-ms 1200000
npm run test:live-eval -- --model medgemma1.5:latest --prompt stricter-no-diagnose
```

On failure, the suite logs failing assertion ids and the raw model answer for each case.

Prompt variants (`--prompt` / `LOCALLAB_CHAT_PROMPT`): `default` (production guidance), `stricter-no-diagnose` (stronger refusal of absolute diagnoses on leading yes/no questions). Production chat always uses `default`.

### Model / prompt comparisons

To compare models or prompt variants on the same Level 1 suite, ask Cursor with the `compare-live-evals` skill, e.g. “compare live evals against gemma4:26b and medgemma1.5:latest” or “compare default vs stricter-no-diagnose on medgemma1.5:latest”. Reports are written to `evals/comparisons/` (gitignored by default; force-add only when committing a decision record).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_TIMEOUT_MS` | `0` | Idle timeout while streaming Ollama tokens; `0` disables the limit |
| `OLLAMA_MODEL` | — | Model for live evals (`npm run test:live-eval`); override with `--model` |
| `LOCALLAB_CHAT_PROMPT` | `default` | Chat prompt variant for live evals; override with `--prompt` |
| `LOCALLAB_LIVE_EVAL` | `0` | Keep `0` for normal use; `test:live-eval` sets this to `1` |
| `LOCALLAB_LIVE_EVAL_TIMEOUT_MS` | `900000` | Per-case live-eval timeout in ms; override with `--timeout-ms` |
| `PORT` | `3001` | Express API port |

Choose a model from the web UI before uploading or generating insights.
