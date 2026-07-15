import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    // Live Ollama scoring — only via npm run test:live-eval
    exclude: [...configDefaults.exclude, "server/**/*.live.eval.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "server/shared"),
    },
  },
});
