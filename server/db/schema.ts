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

export const trendInsights = sqliteTable("trend_insights", {
  markerKey: text("marker_key").primaryKey(),
  contentText: text("content_text").notNull(),
  dataFingerprint: text("data_fingerprint").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const chatConversations = sqliteTable("chat_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contextType: text("context_type").notNull(),
  contextKey: text("context_key").notNull(),
  title: text("title"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Panel = typeof panels.$inferSelect;
export type Marker = typeof markers.$inferSelect;
export type TrendInsight = typeof trendInsights.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewPanel = typeof panels.$inferInsert;
export type NewMarker = typeof markers.$inferInsert;
export type NewTrendInsight = typeof trendInsights.$inferInsert;
export type NewChatConversation = typeof chatConversations.$inferInsert;
export type NewChatMessage = typeof chatMessages.$inferInsert;
