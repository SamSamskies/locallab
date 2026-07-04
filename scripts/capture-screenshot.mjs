#!/usr/bin/env node
//
// Capture the README screenshot from a running production build.
//
// Usage:
//   npm run screenshot
//   node scripts/capture-screenshot.mjs --reuse-server
//
// Environment:
//   SCREENSHOT_MODEL   Model shown in the dropdown (default: qwen3.6:27b-nvfp4)
//   SCREENSHOT_OUTPUT  Output path (default: docs/screenshot.png)
//   SCREENSHOT_PORT    Temp server port (default: 3099)
//   SCREENSHOT_URL     App URL (default: http://localhost:$SCREENSHOT_PORT/)
//   CHROME_PATH        Path to Chrome/Chromium if not auto-detected
//
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.SCREENSHOT_OUTPUT ?? path.join(root, "docs/screenshot.png");
const model = process.env.SCREENSHOT_MODEL ?? "qwen3.6:27b-nvfp4";
const port = Number(process.env.SCREENSHOT_PORT ?? 3099);
const url = process.env.SCREENSHOT_URL ?? `http://localhost:${port}/`;
const viewport = { width: 1440, height: 900 };

async function findChrome() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ];

  for (const candidate of candidates) {
    if (candidate.startsWith("/")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    try {
      const which = spawn("which", [candidate], { stdio: ["ignore", "pipe", "ignore"] });
      const found = await new Promise((resolve) => {
        let out = "";
        which.stdout?.on("data", (chunk) => {
          out += String(chunk);
        });
        which.once("exit", (code) => resolve(code === 0 ? out.trim() : ""));
      });
      if (found) return found;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(
    "Chrome not found. Install Google Chrome or set CHROME_PATH to your browser executable.",
  );
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`);
      if (res.ok) return;
    } catch {
      // Server still starting.
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function startServer() {
  const child = spawn("npm", ["start"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let outputText = "";
  child.stdout?.on("data", (chunk) => {
    outputText += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    outputText += String(chunk);
  });

  const exitPromise = new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      reject(new Error(`Server exited before becoming ready (code ${code}).\n${outputText}`));
    });
  });

  try {
    await Promise.race([waitForHealth(url), exitPromise]);
  } catch (err) {
    child.kill();
    throw err;
  }

  return child;
}

async function isServerRunning(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function send(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 1e9);
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id !== id) return;
      ws.removeEventListener("message", onMessage);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.addEventListener("message", onMessage);
  });
}

async function captureScreenshot(chromePath) {
  const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9333);
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${debugPort}`,
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        break;
      } catch {
        if (i === 19) {
          throw new Error("Timed out waiting for Chrome debugger.");
        }
        await sleep(200);
      }
    }

    const created = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`,
      { method: "PUT" },
    ).then((res) => res.json());

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(created.webSocketDebuggerUrl);

      ws.addEventListener("open", async () => {
        try {
          await send(ws, "Page.enable");
          await send(ws, "Runtime.enable");

          for (let i = 0; i < 30; i++) {
            const { result } = await send(ws, "Runtime.evaluate", {
              expression: "document.querySelector('.model-select') !== null",
              returnByValue: true,
            });
            if (result.value) break;
            await sleep(200);
          }

          await send(ws, "Runtime.evaluate", {
            expression: `
              (() => {
                const select = document.querySelector('.model-select');
                if (!select) throw new Error('Model selector not found');
                select.value = ${JSON.stringify(model)};
                select.dispatchEvent(new Event('change', { bubbles: true }));
              })()
            `,
          });

          await sleep(300);

          const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
          writeFileSync(output, Buffer.from(shot.data, "base64"));
          ws.close();
          resolve();
        } catch (err) {
          ws.close();
          reject(err);
        }
      });

      ws.addEventListener("error", reject);
    });
  } finally {
    chrome.kill();
  }
}

const reuseExistingServer = process.argv.includes("--reuse-server");
let server;

if (reuseExistingServer) {
  if (!(await isServerRunning(url))) {
    throw new Error(`${url} is not reachable. Start the app first or omit --reuse-server.`);
  }
} else {
  server = await startServer();
}

try {
  const chromePath = await findChrome();
  await captureScreenshot(chromePath);
  console.log(`Screenshot saved to ${output}`);
  if (model) {
    console.log(`Model shown: ${model}`);
  }
} finally {
  server?.kill();
}
