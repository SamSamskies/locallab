import cors from "cors";
import express from "express";
import multer from "multer";
import { modelsRouter } from "./routes/models";
import { panelsRouter } from "./routes/panels";
import { trendsRouter } from "./routes/trends";

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

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
