import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { modelsRouter } from "./routes/models";
import { panelsRouter } from "./routes/panels";
import { trendsRouter } from "./routes/trends";

const isProduction = process.env.NODE_ENV === "production";
const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/web");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/models", modelsRouter);
app.use("/api/panels", upload.single("file"), panelsRouter);
app.use("/api/trends", trendsRouter);

if (isProduction) {
  if (!fs.existsSync(webDist)) {
    console.error(`Production web build not found at ${webDist}. Run "npm run build" first.`);
    process.exit(1);
  }

  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(port, () => {
  if (isProduction) {
    console.log(`LocalLab listening on http://localhost:${port}`);
    return;
  }

  console.log(`API listening on http://localhost:${port}`);
});
