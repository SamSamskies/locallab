import { defineConfig } from "vitest/config";
import path from "node:path";

/** Vitest config for live Ollama scoring (`npm run test:live-eval`). */
export default defineConfig({
  test: {
    include: ["server/**/*.live.eval.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "server/shared"),
    },
  },
});
