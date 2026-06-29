import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, test } from "vitest";
import * as schema from "./db/schema";
import { getTrendMarkers, getTrendSeries } from "./services/trends";

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
  `);

  return drizzle(sqlite, { schema });
}

function seedTestData(db: ReturnType<typeof createTestDb>) {
  const panel1 = db
    .insert(schema.panels)
    .values({
      label: "Panel A",
      collectedAt: "2024-01-15",
      sourceFilename: "panel-a.pdf",
      createdAt: "2024-01-16T00:00:00.000Z",
    })
    .run();

  const panel2 = db
    .insert(schema.panels)
    .values({
      label: "Panel B",
      collectedAt: "2024-06-01",
      sourceFilename: "panel-b.pdf",
      createdAt: "2024-06-02T00:00:00.000Z",
    })
    .run();

  const panel3 = db
    .insert(schema.panels)
    .values({
      label: "Panel C (no date)",
      collectedAt: null,
      sourceFilename: "panel-c.pdf",
      createdAt: "2024-07-01T00:00:00.000Z",
    })
    .run();

  const panel1Id = Number(panel1.lastInsertRowid);
  const panel2Id = Number(panel2.lastInsertRowid);
  const panel3Id = Number(panel3.lastInsertRowid);

  db.insert(schema.markers)
    .values([
      {
        panelId: panel1Id,
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
        panelId: panel1Id,
        name: "Creatinine",
        value: 0.9,
        unit: "mg/dL",
        refLow: 0.6,
        refHigh: 1.2,
        flag: "normal",
        category: "Metabolic",
      },
      {
        panelId: panel2Id,
        name: "glucose",
        value: 110,
        unit: "mg/dL",
        refLow: 70,
        refHigh: 100,
        refText: "70-100",
        flag: "high",
        category: "Metabolic",
      },
      {
        panelId: panel2Id,
        name: "Hemoglobin",
        value: null,
        unit: "g/dL",
        refLow: 12,
        refHigh: 16,
        flag: "unknown",
        category: "Hematology",
      },
      {
        panelId: panel3Id,
        name: "Glucose",
        value: 88,
        unit: "mg/dL",
        refLow: 70,
        refHigh: 100,
        flag: "normal",
        category: "Metabolic",
      },
    ])
    .run();
}

describe("getTrendMarkers", () => {
  test("returns marker summaries sorted by name with aggregated data", () => {
    const db = createTestDb();
    seedTestData(db);

    const summaries = getTrendMarkers(db);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.name)).toEqual(["Creatinine", "glucose"]);
    expect(summaries[1]).toMatchObject({
      name: "glucose",
      units: ["mg/dL"],
      category: "Metabolic",
      dataPointCount: 2,
      firstCollectedAt: "2024-01-15",
      lastCollectedAt: "2024-06-01",
      latestValue: 110,
      latestRefLow: 70,
      latestRefHigh: 100,
      latestFlag: "high",
    });
  });

  test("excludes rows with null value or null collectedAt", () => {
    const db = createTestDb();
    seedTestData(db);

    const summaries = getTrendMarkers(db);
    const names = summaries.map((summary) => summary.name.toLowerCase());

    expect(names).not.toContain("hemoglobin");
    expect(summaries.reduce((count, summary) => count + summary.dataPointCount, 0)).toBe(3);
  });
});

describe("getTrendSeries", () => {
  test("returns case-insensitive series sorted by collectedAt ascending", () => {
    const db = createTestDb();
    seedTestData(db);

    const series = getTrendSeries(db, "GLUCOSE");

    expect(series.marker).toBe("GLUCOSE");
    expect(series.points).toHaveLength(2);
    expect(series.points.map((point) => point.collectedAt)).toEqual(["2024-01-15", "2024-06-01"]);
    expect(series.points[0]).toMatchObject({
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
    });
    expect(series.points[1]).toMatchObject({
      panelId: 2,
      panelLabel: "Panel B",
      value: 110,
      flag: "high",
    });
  });

  test("returns empty points for unknown marker", () => {
    const db = createTestDb();
    seedTestData(db);

    const series = getTrendSeries(db, "Unknown Marker");

    expect(series).toEqual({
      marker: "Unknown Marker",
      points: [],
    });
  });

  test("excludes points with null value or null collectedAt", () => {
    const db = createTestDb();
    seedTestData(db);

    expect(getTrendSeries(db, "Hemoglobin").points).toEqual([]);
    expect(getTrendSeries(db, "Glucose").points).toHaveLength(2);
  });
});
