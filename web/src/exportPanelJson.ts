import type { PanelResponse } from "@shared/schema";

function panelExportFilename(panel: PanelResponse): string {
  const slug =
    panel.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `panel-${panel.id}`;
  return `${slug}.json`;
}

function toPanelExport(panel: PanelResponse) {
  const { id: _id, createdAt: _createdAt, ...rest } = panel;
  return rest;
}

export function exportPanelJson(panel: PanelResponse): void {
  const json = JSON.stringify(toPanelExport(panel), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = panelExportFilename(panel);
  link.click();

  URL.revokeObjectURL(url);
}
