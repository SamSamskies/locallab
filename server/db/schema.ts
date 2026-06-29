import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const panels = sqliteTable("panels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  collectedAt: text("collected_at"),
  sourceFilename: text("source_filename").notNull(),
  summary: text("summary"),
  insightsJson: text("insights_json"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const markers = sqliteTable("markers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  panelId: integer("panel_id")
    .notNull()
    .references(() => panels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  value: real("value"),
  unit: text("unit"),
  refLow: real("ref_low"),
  refHigh: real("ref_high"),
  refText: text("ref_text"),
  flag: text("flag").notNull().default("unknown"),
  category: text("category"),
});

export type Panel = typeof panels.$inferSelect;
export type Marker = typeof markers.$inferSelect;
export type NewPanel = typeof panels.$inferInsert;
export type NewMarker = typeof markers.$inferInsert;
