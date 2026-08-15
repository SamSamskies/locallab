import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import type { AppSettings, AppSettingsPatch } from "../shared/schema";

type AppDb = BetterSQLite3Database<typeof schema>;

const KEY_SELECTED_MODEL = "selectedModel";
const KEY_CHAT_THINK = "chatThink";

function getRaw(db: AppDb, key: string): string | null {
  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get();
  return row?.value ?? null;
}

function setRaw(db: AppDb, key: string, value: string): void {
  db.insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value },
    })
    .run();
}

function parseChatThink(raw: string | null): boolean {
  return raw === "true" || raw === "1";
}

export function getAppSettings(db: AppDb): AppSettings {
  const selectedModelRaw = getRaw(db, KEY_SELECTED_MODEL)?.trim() ?? "";
  return {
    selectedModel: selectedModelRaw || null,
    chatThink: parseChatThink(getRaw(db, KEY_CHAT_THINK)),
  };
}

export function updateAppSettings(
  db: AppDb,
  patch: AppSettingsPatch,
): AppSettings {
  if (patch.selectedModel !== undefined) {
    const next = patch.selectedModel?.trim() ?? "";
    if (next) {
      setRaw(db, KEY_SELECTED_MODEL, next);
    } else {
      db.delete(schema.appSettings)
        .where(eq(schema.appSettings.key, KEY_SELECTED_MODEL))
        .run();
    }
  }

  if (patch.chatThink !== undefined) {
    setRaw(db, KEY_CHAT_THINK, patch.chatThink ? "true" : "false");
  }

  return getAppSettings(db);
}
