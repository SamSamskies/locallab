#!/usr/bin/env node
//
// Run gated Level 1 live scoring evals against a local Ollama model.
//
// Usage:
//   npm run test:live-eval
//   npm run test:live-eval -- --suite trend --model llama3.2
//   npm run test:live-eval -- --suite panel --model qwen3.6:27b --timeout-ms 1200000
//   OLLAMA_MODEL=llama3.2 npm run test:live-eval
//
// Runs server/*.live.eval.test.ts via vitest.live.config.ts
// (those files are excluded from default npm test).
//
// Environment:
//   LOCALLAB_LIVE_EVAL              Set to 1 by this script (required to unskip the suite)
//   OLLAMA_MODEL                    Model name (required; override with --model / -m)
//   LOCALLAB_LIVE_EVAL_TIMEOUT_MS   Per-case timeout in ms (default 900000 / 15m; --timeout-ms / -t)
//   OLLAMA_URL                      Ollama base URL (default in app: http://localhost:11434)
//
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TIMEOUT_MS = 900_000;
const LIVE_EVAL_FILES = {
  panel: "server/panelChat.live.eval.test.ts",
  trend: "server/trendChat.live.eval.test.ts",
};

/** @returns {Record<string, string>} */
function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {string | undefined} raw
 * @param {string} label
 * @returns {number | undefined}
 */
function parsePositiveMs(raw, label) {
  if (raw === undefined) return undefined;
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`${label} must be a positive number of milliseconds.`);
    process.exit(1);
  }
  return parsed;
}

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function resolveSuiteFiles(raw) {
  const suite = (raw ?? "all").trim().toLowerCase();
  if (suite === "all") {
    return [LIVE_EVAL_FILES.panel, LIVE_EVAL_FILES.trend];
  }
  if (suite === "panel" || suite === "trend") {
    return [LIVE_EVAL_FILES[suite]];
  }
  console.error(
    `--suite must be panel, trend, or all (got ${JSON.stringify(raw)}).`,
  );
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    model: { type: "string", short: "m" },
    "timeout-ms": { type: "string", short: "t" },
    suite: { type: "string", short: "s" },
  },
  allowPositionals: true,
});

// .env fills gaps; real process.env wins; flags win over both.
const env = {
  ...loadDotEnv(path.join(root, ".env")),
  ...process.env,
  LOCALLAB_LIVE_EVAL: "1",
};

if (values.model !== undefined) {
  env.OLLAMA_MODEL = values.model;
}

const timeoutFromFlag = parsePositiveMs(values["timeout-ms"], "--timeout-ms");
if (timeoutFromFlag !== undefined) {
  env.LOCALLAB_LIVE_EVAL_TIMEOUT_MS = String(timeoutFromFlag);
} else if (!String(env.LOCALLAB_LIVE_EVAL_TIMEOUT_MS ?? "").trim()) {
  env.LOCALLAB_LIVE_EVAL_TIMEOUT_MS = String(DEFAULT_TIMEOUT_MS);
} else {
  // Validate whatever came from .env / process.env
  parsePositiveMs(env.LOCALLAB_LIVE_EVAL_TIMEOUT_MS, "LOCALLAB_LIVE_EVAL_TIMEOUT_MS");
}

if (!String(env.OLLAMA_MODEL ?? "").trim()) {
  console.error(
    "OLLAMA_MODEL is required for live evals.\n" +
      "  npm run test:live-eval -- --model <name>\n" +
      "  or set OLLAMA_MODEL in .env / the environment.",
  );
  process.exit(1);
}

const suiteFiles = resolveSuiteFiles(values.suite);

console.log(
  `[live-eval] suite=${values.suite ?? "all"} model=${env.OLLAMA_MODEL} timeoutMs=${env.LOCALLAB_LIVE_EVAL_TIMEOUT_MS}`,
);

const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "--config",
    "vitest.live.config.ts",
    ...suiteFiles,
  ],
  {
    cwd: root,
    env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
