import type {
  ModelInfo,
  PanelListItem,
  PanelResponse,
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

async function readUploadStream(
  response: Response,
  onEvent?: (event: UploadStreamEvent) => void,
): Promise<PanelResponse> {
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
  let panel: PanelResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseStreamLine(line);
      if (!event) continue;

      onEvent?.(event);

      if (event.type === "done") {
        panel = event.panel;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  const trailing = parseStreamLine(buffer);
  if (trailing) {
    onEvent?.(trailing);
    if (trailing.type === "done") panel = trailing.panel;
    if (trailing.type === "error") throw new Error(trailing.error);
  }

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
