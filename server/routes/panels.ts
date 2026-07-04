import { Router, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { markers, panels } from "../db/schema";
import { deleteConversationsForPanel } from "../services/chatStore";
import { extractFromPdfText } from "../services/extract";
import { extractPdfText } from "../services/pdf";
import type { PanelListItem, PanelResponse, UploadStreamEvent } from "../shared/schema";

export const panelsRouter = Router();

function toPanelResponse(panelId: number): PanelResponse | null {
  const panel = db.select().from(panels).where(eq(panels.id, panelId)).get();
  if (!panel) return null;

  const panelMarkers = db
    .select()
    .from(markers)
    .where(eq(markers.panelId, panelId))
    .all();

  const insights = panel.insightsJson ? JSON.parse(panel.insightsJson) : [];

  return {
    id: panel.id,
    label: panel.label,
    collectedAt: panel.collectedAt,
    sourceFilename: panel.sourceFilename,
    summary: panel.summary,
    insights,
    createdAt: panel.createdAt,
    markers: panelMarkers.map((m) => ({
      id: m.id,
      panelId: m.panelId,
      name: m.name,
      value: m.value,
      unit: m.unit,
      refLow: m.refLow,
      refHigh: m.refHigh,
      refText: m.refText,
      flag: m.flag as "low" | "normal" | "high" | "unknown",
      category: m.category,
    })),
  };
}

panelsRouter.get("/", (_req, res) => {
  const rows = db.select().from(panels).all();
  const items: PanelListItem[] = rows
    .map((panel) => {
      const markerCount = db
        .select()
        .from(markers)
        .where(eq(markers.panelId, panel.id))
        .all().length;

      return {
        id: panel.id,
        label: panel.label,
        collectedAt: panel.collectedAt,
        sourceFilename: panel.sourceFilename,
        markerCount,
        createdAt: panel.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json(items);
});

panelsRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid panel id" });
    return;
  }

  const panel = toPanelResponse(id);
  if (!panel) {
    res.status(404).json({ error: "Panel not found" });
    return;
  }

  res.json(panel);
});

panelsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid panel id" });
    return;
  }

  const result = db.delete(panels).where(eq(panels.id, id)).run();
  if (result.changes === 0) {
    res.status(404).json({ error: "Panel not found" });
    return;
  }

  deleteConversationsForPanel(db, id);

  res.status(204).end();
});

function writeStreamEvent(res: Response, event: UploadStreamEvent): void {
  res.write(`${JSON.stringify(event)}\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  flush?.();
}

panelsRouter.post("/", async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "PDF file is required" });
    return;
  }

  if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF files are supported" });
    return;
  }

  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: UploadStreamEvent) => writeStreamEvent(res, event);

  try {
    send({ type: "status", message: "Reading PDF…" });
    const { text } = await extractPdfText(file.buffer);

    send({ type: "status", message: "Analyzing with local LLM…" });
    const extraction = await extractFromPdfText(text, file.originalname, model, (content, phase) => {
      send({ type: "token", content, phase });
    });

    send({ type: "status", message: "Saving results…" });
    const insertPanel = db
      .insert(panels)
      .values({
        label: extraction.panelLabel ?? file.originalname.replace(/\.pdf$/i, ""),
        collectedAt: extraction.collectedDate ?? null,
        sourceFilename: file.originalname,
        summary: extraction.summary ?? null,
        insightsJson: JSON.stringify(extraction.insights ?? []),
      })
      .run();

    const panelId = Number(insertPanel.lastInsertRowid);

    for (const marker of extraction.markers) {
      db.insert(markers)
        .values({
          panelId,
          name: marker.name,
          value: marker.value ?? null,
          unit: marker.unit ?? null,
          refLow: marker.refLow ?? null,
          refHigh: marker.refHigh ?? null,
          refText: marker.refText ?? null,
          flag: marker.flag,
          category: marker.category ?? null,
        })
        .run();
    }

    const panel = toPanelResponse(panelId);
    if (!panel) {
      throw new Error("Failed to load saved panel");
    }

    send({ type: "done", panel });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze panel";
    send({ type: "error", error: message });
    res.end();
  }
});
