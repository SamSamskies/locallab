const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen3.6:27b";

export function getOllamaUrl(): string {
  return process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
}

export function getDefaultModel(): string {
  return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
}

/** Idle timeout in ms; 0 disables. Resets on each streamed token. */
export function getOllamaTimeoutMs(): number {
  const raw = process.env.OLLAMA_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function listModels(): Promise<string[]> {
  const response = await fetch(`${getOllamaUrl()}/api/tags`);
  if (!response.ok) {
    throw new Error(`Failed to list Ollama models: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    models?: Array<{ name: string }>;
  };

  return (data.models ?? []).map((m) => m.name).sort();
}

type OllamaStreamChunk = {
  message?: { content?: string; thinking?: string };
};

export type StreamTokenPhase = "thinking" | "content";

async function readOllamaStream(
  response: Response,
  onToken: (token: string, phase: StreamTokenPhase) => void,
  idleTimeoutMs: number,
): Promise<string> {
  if (!response.body) {
    throw new Error("Ollama returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const armIdleTimeout = () => {
    if (idleTimeoutMs <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      void reader.cancel();
    }, idleTimeoutMs);
  };

  const disarmIdleTimeout = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
  };

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as OllamaStreamChunk;
    const contentDelta = chunk.message?.content ?? "";
    const thinkingDelta = chunk.message?.thinking ?? "";

    if (thinkingDelta) {
      onToken(thinkingDelta, "thinking");
    }
    if (contentDelta) {
      content += contentDelta;
      onToken(contentDelta, "content");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      armIdleTimeout();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
      }
    }

    if (buffer) {
      processLine(buffer);
    }
  } finally {
    disarmIdleTimeout();
  }

  if (timedOut) {
    throw new Error(
      "Ollama request timed out (no response). Try a smaller model, shorter PDF, or set OLLAMA_TIMEOUT_MS=0.",
    );
  }

  if (!content) {
    throw new Error("Ollama returned an empty response");
  }

  return content;
}

export async function chatJsonStreaming<T>(
  prompt: string,
  onToken: (token: string, phase: StreamTokenPhase) => void,
  model?: string,
): Promise<T> {
  const response = await fetch(`${getOllamaUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model ?? getDefaultModel(),
      stream: true,
      format: "json",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${body}`);
  }

  const content = await readOllamaStream(response, onToken, getOllamaTimeoutMs());
  return JSON.parse(content) as T;
}

export async function chatJson<T>(prompt: string, model?: string): Promise<T> {
  return chatJsonStreaming<T>(prompt, () => {}, model);
}
