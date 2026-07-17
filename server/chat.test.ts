import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, test } from "vitest";
import * as schema from "./db/schema";
import { buildChatSystemPrompt, loadChatContext } from "./services/chat";
import {
  appendMessages,
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations,
  titleFromMessage,
} from "./services/chatStore";
import type { PanelResponse, TrendSeries } from "./shared/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      collected_at TEXT,
      source_filename TEXT NOT NULL,
      summary TEXT,
      insights_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE markers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value REAL,
      unit TEXT,
      ref_low REAL,
      ref_high REAL,
      ref_text TEXT,
      flag TEXT NOT NULL DEFAULT 'unknown',
      category TEXT
    );

    CREATE TABLE chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_type TEXT NOT NULL,
      context_key TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_chat_conversations_context
      ON chat_conversations(context_type, context_key);

    CREATE INDEX idx_chat_messages_conversation
      ON chat_messages(conversation_id);
  `);
  return drizzle(sqlite, { schema });
}

const glucoseSeries: TrendSeries = {
  marker: "Glucose",
  points: [
    {
      panelId: 1,
      panelLabel: "Panel A",
      collectedAt: "2024-01-15",
      value: 95,
      unit: "mg/dL",
      refLow: 70,
      refHigh: 100,
      refText: "70-100",
      flag: "normal",
      category: "Metabolic",
    },
    {
      panelId: 2,
      panelLabel: "Panel B",
      collectedAt: "2024-06-01",
      value: 110,
      unit: "mg/dL",
      refLow: 70,
      refHigh: 100,
      refText: "70-100",
      flag: "high",
      category: "Metabolic",
    },
  ],
};

describe("titleFromMessage", () => {
  test("truncates long titles", () => {
    const long = "a".repeat(80);
    expect(titleFromMessage(long)).toBe(`${"a".repeat(57)}...`);
  });
});

describe("chat store", () => {
  test("creates, lists, appends, and deletes conversations", () => {
    const db = createTestDb();

    const first = createConversation(db, "trend", "Glucose", "First chat");
    const second = createConversation(db, "trend", "glucose", "Second chat");

    expect(listConversations(db, "trend", "GLUCOSE")).toHaveLength(2);
    expect(listConversations(db, "trend", "GLUCOSE")[0]?.id).toBe(second.id);

    appendMessages(db, first.id, [
      { role: "user", content: "What changed?" },
      { role: "assistant", content: "It rose slightly." },
    ]);

    const messages = getConversationMessages(db, first.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.content).toBe("It rose slightly.");

    expect(deleteConversation(db, first.id)).toBe(true);
    expect(getConversationMessages(db, first.id)).toHaveLength(0);
    expect(listConversations(db, "trend", "Glucose")).toHaveLength(1);
  });
});

describe("buildChatSystemPrompt", () => {
  test("includes panel markers and summary", () => {
    const panel: PanelResponse = {
      id: 1,
      label: "CMP",
      collectedAt: "2024-01-15",
      sourceFilename: "cmp.pdf",
      summary: "Mostly normal.",
      insights: ["Glucose is slightly high"],
      createdAt: "2024-01-16T00:00:00.000Z",
      markers: [
        {
          id: 1,
          panelId: 1,
          name: "Glucose",
          value: 110,
          unit: "mg/dL",
          refLow: 70,
          refHigh: 100,
          refText: "70-100",
          flag: "high",
          category: "Metabolic",
        },
      ],
    };

    const prompt = buildChatSystemPrompt({ type: "panel", panel });
    expect(prompt).toContain("CMP");
    expect(prompt).toContain("Glucose");
    expect(prompt).toContain("Mostly normal.");
    expect(prompt).toContain("Glucose is slightly high");
    expect(prompt).toContain("general medical and scientific knowledge");
    expect(prompt).toContain("Do not diagnose or prescribe");
    expect(prompt).not.toContain("using only this panel data");
  });

  test("includes trend history rows and related panel markers", () => {
    const panels: PanelResponse[] = [
      {
        id: 1,
        label: "Panel A",
        collectedAt: "2024-01-15",
        sourceFilename: "a.pdf",
        summary: "First panel",
        insights: [],
        createdAt: "2024-01-16T00:00:00.000Z",
        markers: [
          {
            id: 1,
            panelId: 1,
            name: "Glucose",
            value: 95,
            unit: "mg/dL",
            refLow: 70,
            refHigh: 100,
            refText: "70-100",
            flag: "normal",
            category: "Metabolic",
          },
          {
            id: 2,
            panelId: 1,
            name: "Total Cholesterol",
            value: 180,
            unit: "mg/dL",
            refLow: null,
            refHigh: 200,
            refText: "<200",
            flag: "normal",
            category: "Lipids",
          },
        ],
      },
      {
        id: 2,
        label: "Panel B",
        collectedAt: "2024-06-01",
        sourceFilename: "b.pdf",
        summary: "Second panel",
        insights: [],
        createdAt: "2024-06-02T00:00:00.000Z",
        markers: [
          {
            id: 3,
            panelId: 2,
            name: "Glucose",
            value: 110,
            unit: "mg/dL",
            refLow: 70,
            refHigh: 100,
            refText: "70-100",
            flag: "high",
            category: "Metabolic",
          },
        ],
      },
    ];

    const prompt = buildChatSystemPrompt({ type: "trend", series: glucoseSeries, panels });
    expect(prompt).toContain("Primary marker trend");
    expect(prompt).toContain("Full panel data for each lab visit");
    expect(prompt).toContain("Glucose");
    expect(prompt).toContain("Panel A");
    expect(prompt).toContain("Panel B");
    expect(prompt).toContain("Total Cholesterol");
    expect(prompt).toContain("flag: high");
  });
});

describe("loadChatContext", () => {
  test("loads panel context from database", () => {
    const db = createTestDb();
    const panelInsert = db
      .insert(schema.panels)
      .values({
        label: "CMP",
        collectedAt: "2024-01-15",
        sourceFilename: "cmp.pdf",
        summary: "Summary",
        insightsJson: JSON.stringify(["Insight"]),
        createdAt: "2024-01-16T00:00:00.000Z",
      })
      .run();

    const panelId = Number(panelInsert.lastInsertRowid);
    db.insert(schema.markers)
      .values({
        panelId,
        name: "Glucose",
        value: 95,
        unit: "mg/dL",
        refLow: 70,
        refHigh: 100,
        refText: "70-100",
        flag: "normal",
        category: "Metabolic",
      })
      .run();

    const context = loadChatContext("panel", String(panelId), db);
    expect(context?.type).toBe("panel");
    if (context?.type === "panel") {
      expect(context.panel.label).toBe("CMP");
      expect(context.panel.markers).toHaveLength(1);
    }
  });

  test("loads trend context with full panel data", () => {
    const db = createTestDb();
    const panelA = db
      .insert(schema.panels)
      .values({
        label: "Panel A",
        collectedAt: "2024-01-15",
        sourceFilename: "a.pdf",
        summary: "First",
        insightsJson: JSON.stringify([]),
        createdAt: "2024-01-16T00:00:00.000Z",
      })
      .run();
    const panelB = db
      .insert(schema.panels)
      .values({
        label: "Panel B",
        collectedAt: "2024-06-01",
        sourceFilename: "b.pdf",
        summary: "Second",
        insightsJson: JSON.stringify([]),
        createdAt: "2024-06-02T00:00:00.000Z",
      })
      .run();

    const panelAId = Number(panelA.lastInsertRowid);
    const panelBId = Number(panelB.lastInsertRowid);

    db.insert(schema.markers)
      .values([
        {
          panelId: panelAId,
          name: "LDL",
          value: 95,
          unit: "mg/dL",
          refLow: null,
          refHigh: 100,
          refText: "<100",
          flag: "normal",
          category: "Lipids",
        },
        {
          panelId: panelAId,
          name: "Total Cholesterol",
          value: 180,
          unit: "mg/dL",
          refLow: null,
          refHigh: 200,
          refText: "<200",
          flag: "normal",
          category: "Lipids",
        },
        {
          panelId: panelBId,
          name: "LDL",
          value: 110,
          unit: "mg/dL",
          refLow: null,
          refHigh: 100,
          refText: "<100",
          flag: "high",
          category: "Lipids",
        },
      ])
      .run();

    const context = loadChatContext("trend", "LDL", db);
    expect(context?.type).toBe("trend");
    if (context?.type === "trend") {
      expect(context.series.points).toHaveLength(2);
      expect(context.panels).toHaveLength(2);
      expect(context.panels[0]?.label).toBe("Panel A");
      expect(context.panels[0]?.markers.some((m) => m.name === "Total Cholesterol")).toBe(true);
    }
  });
});
