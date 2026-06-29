import { Router } from "express";
import { db } from "../db/client";
import { getTrendMarkers, getTrendSeries } from "../services/trends";

export const trendsRouter = Router();

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
