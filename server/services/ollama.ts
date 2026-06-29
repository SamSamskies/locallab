const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen3.6:27b";
const DEFAULT_TIMEOUT_MS = 300_000;

export function getOllamaUrl(): string {
  return process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
}

export function getDefaultModel(): string {
  return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
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

export async function chatJson<T>(
  prompt: string,
  model?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: model ?? getDefaultModel(),
        stream: false,
        format: "json",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };

    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response");
    }

    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Ollama request timed out. Try a smaller model or shorter PDF.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
