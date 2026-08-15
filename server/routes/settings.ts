import { Router } from "express";
import { db } from "../db/client";
import { appSettingsPatchSchema } from "../shared/schema";
import { getAppSettings, updateAppSettings } from "../services/settings";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(getAppSettings(db));
});

settingsRouter.patch("/", (req, res) => {
  const parsed = appSettingsPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings payload" });
    return;
  }

  if (
    parsed.data.selectedModel === undefined &&
    parsed.data.chatThink === undefined
  ) {
    res.status(400).json({ error: "No settings to update" });
    return;
  }

  res.json(updateAppSettings(db, parsed.data));
});
