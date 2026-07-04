import { Router, type Response } from "express";
import { db } from "../db/client";
import {
  getCachedTrendInsight,
  saveCachedTrendInsight,
} from "../services/trendInsightCache";
import { generateTrendInsight } from "../services/trendInsights";
import { getTrendMarkers, getTrendSeries } from "../services/trends";
import type { TrendInsightStreamEvent } from "../shared/schema";

export const trendsRouter = Router();

function writeStreamEvent(res: Response, event: TrendInsightStreamEvent): void {
  res.write(`${JSON.stringify(event)}\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  flush?.();
}

trendsRouter.get("/markers", (_req, res) => {
  res.json(getTrendMarkers(db));
});

trendsRouter.get("/", (req, res) => {
  const marker = typeof req.query.marker === "string" ? req.query.marker.trim() : "";

  if (!marker) {
    res.status(400).json({ error: "marker query parameter is required" });
    return;
  }

  res.json(getTrendSeries(db, marker));
});

trendsRouter.get("/insights", (req, res) => {
  const marker = typeof req.query.marker === "string" ? req.query.marker.trim() : "";

  if (!marker) {
    res.status(400).json({ error: "marker query parameter is required" });
    return;
  }

  const series = getTrendSeries(db, marker);
  if (series.points.length === 0) {
    res.status(404).json({ error: "No trend data for this marker" });
    return;
  }

  const cached = getCachedTrendInsight(db, marker, series);
  if (!cached) {
    res.status(404).json({ error: "No cached insight for this marker" });
    return;
  }

  res.json(cached);
});

trendsRouter.post("/insights", async (req, res) => {
  const marker = typeof req.body?.marker === "string" ? req.body.marker.trim() : "";
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  if (!marker) {
    res.status(400).json({ error: "marker is required" });
    return;
  }

  const series = getTrendSeries(db, marker);
  if (series.points.length === 0) {
    res.status(400).json({ error: "No trend data for this marker" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: TrendInsightStreamEvent) => writeStreamEvent(res, event);

  try {
    send({ type: "status", message: "Analyzing trend with local LLM…" });
    let contentText = "";
    await generateTrendInsight(series, (content, phase) => {
      if (phase === "content") {
        contentText += content;
      }
      send({ type: "token", content, phase });
    }, model);
    saveCachedTrendInsight(db, marker, series, contentText);
    send({ type: "done" });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate trend insight";
    send({ type: "error", error: message });
    res.end();
  }
});
