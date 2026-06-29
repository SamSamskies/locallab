# LocalLab

A privacy-first, fully-local web app for analyzing blood work results. Upload a lab PDF, extract structured markers with a local Ollama LLM, store results in SQLite, and view insights and trends.

![LocalLab web UI](docs/screenshot.png)

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Ollama](https://ollama.com) running locally
- Pull the default model:

```bash
ollama pull qwen3.6:27b
```

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

## Verify

```bash
npm run verify
```

Runs TypeScript type-checking (`tsc --noEmit`) and unit tests.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen3.6:27b` | Default model for extraction |
| `PORT` | `3001` | Express API port |

You can also switch models in the web UI.

## Limitations (v1)

- Text-based PDFs only (no OCR for scanned/image PDFs)
- No marker editing or personalized reference ranges yet
- Trend charts planned for a future slice
