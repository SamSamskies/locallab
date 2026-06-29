import type {
  CachedTrendInsight,
  ModelInfo,
  PanelListItem,
  PanelResponse,
  TrendInsightStreamEvent,
  TrendMarkerSummary,
  TrendSeries,
  UploadStreamEvent,
} from "@shared/schema";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function parseStreamLine(line: string): UploadStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as UploadStreamEvent;
}

function parseTrendInsightLine(line: string): TrendInsightStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as TrendInsightStreamEvent;
}

async function readNdjsonStream<T>(
  response: Response,
  parseLine: (line: string) => T | null,
  onEvent: ((event: T) => void) | undefined,
  onComplete: (event: T) => boolean,
): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("Server returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseLine(line);
      if (!event) continue;

      onEvent?.(event);

      if (onComplete(event)) {
        completed = true;
      }
    }
  }

  const trailing = parseLine(buffer);
  if (trailing) {
    onEvent?.(trailing);
    if (onComplete(trailing)) {
      completed = true;
    }
  }

  if (!completed) {
    throw new Error("Stream ended without a result");
  }
}

async function readUploadStream(
  response: Response,
  onEvent?: (event: UploadStreamEvent) => void,
): Promise<PanelResponse> {
  let panel: PanelResponse | null = null;

  await readNdjsonStream(
    response,
    parseStreamLine,
    onEvent,
    (event) => {
      if (event.type === "done") {
        panel = event.panel;
        return true;
      }
      if (event.type === "error") {
        throw new Error(event.error);
      }
      return false;
    },
  );

  if (!panel) {
    throw new Error("Upload completed without a result");
  }

  return panel;
}

export async function fetchModels(): Promise<ModelInfo[]> {
  return handleResponse(await fetch("/api/models"));
}

export async function fetchPanels(): Promise<PanelListItem[]> {
  return handleResponse(await fetch("/api/panels"));
}

export async function fetchPanel(id: number): Promise<PanelResponse> {
  return handleResponse(await fetch(`/api/panels/${id}`));
}

export async function fetchTrendMarkers(): Promise<TrendMarkerSummary[]> {
  return handleResponse(await fetch("/api/trends/markers"));
}

export async function fetchTrendSeries(marker: string): Promise<TrendSeries> {
  return handleResponse(
    await fetch(`/api/trends?marker=${encodeURIComponent(marker)}`),
  );
}

export async function fetchCachedTrendInsight(
  marker: string,
): Promise<CachedTrendInsight | null> {
  const response = await fetch(
    `/api/trends/insights?marker=${encodeURIComponent(marker)}`,
  );
  if (response.status === 404) return null;
  return handleResponse(response);
}

export async function fetchTrendInsights(
  marker: string,
  model?: string,
  onEvent?: (event: TrendInsightStreamEvent) => void,
): Promise<void> {
  const response = await fetch("/api/trends/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marker, model }),
  });

  await readNdjsonStream(
    response,
    parseTrendInsightLine,
    onEvent,
    (event) => {
      if (event.type === "error") {
        throw new Error(event.error);
      }
      return event.type === "done";
    },
  );
}

export async function uploadPanel(
  file: File,
  model?: string,
  onEvent?: (event: UploadStreamEvent) => void,
): Promise<PanelResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (model) formData.append("model", model);

  const response = await fetch("/api/panels", {
    method: "POST",
    body: formData,
  });

  return readUploadStream(response, onEvent);
}
