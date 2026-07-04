import { Router } from "express";
import { listModels } from "../services/ollama";
import type { ModelInfo } from "../shared/schema";

export const modelsRouter = Router();

modelsRouter.get("/", async (_req, res) => {
  try {
    const names = await listModels();
    const models: ModelInfo[] = names.map((name) => ({ name }));
    res.json(models);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list models";
    res.status(503).json({ error: message });
  }
});
