import type { ModelInfo, PanelListItem, PanelResponse } from "@shared/schema";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
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

export async function uploadPanel(file: File, model?: string): Promise<PanelResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (model) formData.append("model", model);

  return handleResponse(
    await fetch("/api/panels", {
      method: "POST",
      body: formData,
    }),
  );
}
