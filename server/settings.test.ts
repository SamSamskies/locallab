import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, test } from "vitest";
import * as schema from "./db/schema";
import { getAppSettings, updateAppSettings } from "./services/settings";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

describe("app settings", () => {
  test("defaults selectedModel null and chatThink false", () => {
    const db = createTestDb();
    expect(getAppSettings(db)).toEqual({
      selectedModel: null,
      chatThink: false,
    });
  });

  test("persists selectedModel and chatThink", () => {
    const db = createTestDb();
    expect(
      updateAppSettings(db, {
        selectedModel: "gemma4:26b-mlx",
        chatThink: true,
      }),
    ).toEqual({
      selectedModel: "gemma4:26b-mlx",
      chatThink: true,
    });
    expect(getAppSettings(db)).toEqual({
      selectedModel: "gemma4:26b-mlx",
      chatThink: true,
    });
  });

  test("clears selectedModel when set to null or blank", () => {
    const db = createTestDb();
    updateAppSettings(db, { selectedModel: "gemma4:26b-mlx" });
    expect(updateAppSettings(db, { selectedModel: null }).selectedModel).toBe(
      null,
    );
    updateAppSettings(db, { selectedModel: "gemma4:26b-mlx" });
    expect(updateAppSettings(db, { selectedModel: "  " }).selectedModel).toBe(
      null,
    );
  });

  test("partial patch leaves other fields alone", () => {
    const db = createTestDb();
    updateAppSettings(db, {
      selectedModel: "gemma4:26b-mlx",
      chatThink: true,
    });
    expect(updateAppSettings(db, { chatThink: false })).toEqual({
      selectedModel: "gemma4:26b-mlx",
      chatThink: false,
    });
  });
});
