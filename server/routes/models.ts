import { Router } from "express";
import { getDefaultModel, listModels } from "../services/ollama";
import type { ModelInfo } from "../shared/schema";

export const modelsRouter = Router();

modelsRouter.get("/", async (_req, res) => {
  try {
    const names = await listModels();
    const defaultModel = getDefaultModel();
    const models: ModelInfo[] = names.map((name) => ({
      name,
      default: name === defaultModel,
    }));

    if (!models.some((m) => m.default) && defaultModel) {
      models.unshift({ name: defaultModel, default: true });
    }

    res.json(models);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list models";
    res.status(503).json({ error: message });
  }
});
