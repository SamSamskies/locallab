import { Router, type Response } from "express";
import { db } from "../db/client";
import {
  getCachedOverallTrendInsight,
  getCachedTrendInsight,
  saveCachedOverallTrendInsight,
  saveCachedTrendInsight,
} from "../services/trendInsightCache";
import {
  generateOverallTrendInsight,
  generateTrendInsight,
} from "../services/trendInsights";
import { getOverallTrendContext, getTrendMarkers, getTrendSeries } from "../services/trends";
import type { TrendInsightStreamEvent } from "../shared/schema";

export const trendsRouter = Router();

function writeStreamEvent(res: Response, event: TrendInsightStreamEvent): void {
  res.write(`${JSON.stringify(event)}\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  flush?.();
}

function beginNdjsonStream(res: Response): void {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
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

trendsRouter.get("/insights/overall", (_req, res) => {
  const context = getOverallTrendContext(db);
  if (context.markers.length === 0) {
    res.status(404).json({ error: "No trend data available" });
    return;
  }

  const cached = getCachedOverallTrendInsight(db, context);
  if (!cached) {
    res.status(404).json({ error: "No cached overall insight" });
    return;
  }

  res.json(cached);
});

trendsRouter.post("/insights/overall", async (req, res) => {
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  const context = getOverallTrendContext(db);
  if (context.markers.length === 0) {
    res.status(400).json({ error: "No trend data available" });
    return;
  }

  beginNdjsonStream(res);
  const send = (event: TrendInsightStreamEvent) => writeStreamEvent(res, event);

  try {
    send({ type: "status", message: "Analyzing overall health trends with local LLM…" });
    let contentText = "";
    await generateOverallTrendInsight(context, (content, phase) => {
      if (phase === "content") {
        contentText += content;
      }
      send({ type: "token", content, phase });
    }, model);
    saveCachedOverallTrendInsight(db, context, contentText);
    send({ type: "done" });
    res.end();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate overall trend insight";
    send({ type: "error", error: message });
    res.end();
  }
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

  beginNdjsonStream(res);
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
