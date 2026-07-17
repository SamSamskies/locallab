import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, test } from "vitest";
import * as schema from "./db/schema";
import {
  getCachedOverallTrendInsight,
  getCachedTrendInsight,
  overallTrendFingerprint,
  saveCachedOverallTrendInsight,
  saveCachedTrendInsight,
  trendSeriesFingerprint,
} from "./services/trendInsightCache";
import type { OverallTrendContext, TrendSeries } from "./shared/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE trend_insights (
      marker_key TEXT PRIMARY KEY,
      content_text TEXT NOT NULL,
      data_fingerprint TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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

describe("trendSeriesFingerprint", () => {
  test("changes when trend data changes", () => {
    const original = trendSeriesFingerprint(glucoseSeries);
    const updated = trendSeriesFingerprint({
      ...glucoseSeries,
      points: [
        ...glucoseSeries.points,
        {
          ...glucoseSeries.points[1]!,
          panelId: 3,
          collectedAt: "2024-09-01",
          value: 105,
        },
      ],
    });

    expect(original).not.toBe(updated);
  });
});

describe("trend insight cache", () => {
  test("returns null when no cache exists", () => {
    const db = createTestDb();
    expect(getCachedTrendInsight(db, "Glucose", glucoseSeries)).toBeNull();
  });

  test("saves and retrieves cached insight for marker", () => {
    const db = createTestDb();

    saveCachedTrendInsight(db, "Glucose", glucoseSeries, "Rising trend.");

    expect(getCachedTrendInsight(db, "Glucose", glucoseSeries)).toMatchObject({
      content: "Rising trend.",
    });
  });

  test("matches marker case-insensitively", () => {
    const db = createTestDb();

    saveCachedTrendInsight(db, "glucose", glucoseSeries, "Cached insight.");

    expect(getCachedTrendInsight(db, "GLUCOSE", glucoseSeries)?.content).toBe(
      "Cached insight.",
    );
  });

  test("invalidates cache when trend data changes", () => {
    const db = createTestDb();

    saveCachedTrendInsight(db, "Glucose", glucoseSeries, "Old insight.");

    const updatedSeries: TrendSeries = {
      ...glucoseSeries,
      points: [
        ...glucoseSeries.points,
        {
          ...glucoseSeries.points[1]!,
          panelId: 3,
          collectedAt: "2024-09-01",
          value: 105,
        },
      ],
    };

    expect(getCachedTrendInsight(db, "Glucose", updatedSeries)).toBeNull();
  });

  test("overwrites existing cache on save", () => {
    const db = createTestDb();

    saveCachedTrendInsight(db, "Glucose", glucoseSeries, "Old insight.");
    saveCachedTrendInsight(db, "Glucose", glucoseSeries, "New insight.");

    expect(getCachedTrendInsight(db, "Glucose", glucoseSeries)).toMatchObject({
      content: "New insight.",
    });
  });
});

const overallContext: OverallTrendContext = {
  visits: [
    {
      panelId: 1,
      panelLabel: "Panel A",
      collectedAt: "2024-01-15",
      summary: "Mostly normal.",
      insights: ["Glucose ok"],
    },
    {
      panelId: 2,
      panelLabel: "Panel B",
      collectedAt: "2024-06-01",
      summary: "Glucose up.",
      insights: ["Glucose high"],
    },
  ],
  markers: [
    {
      name: "Glucose",
      category: "Metabolic",
      unit: "mg/dL",
      dataPointCount: 2,
      firstCollectedAt: "2024-01-15",
      lastCollectedAt: "2024-06-01",
      firstValue: 95,
      lastValue: 110,
      firstFlag: "normal",
      lastFlag: "high",
      latestRefLow: 70,
      latestRefHigh: 100,
      latestRefText: "70-100",
    },
  ],
};

describe("overallTrendFingerprint", () => {
  test("changes when overall data changes", () => {
    const original = overallTrendFingerprint(overallContext);
    const updated = overallTrendFingerprint({
      ...overallContext,
      markers: [
        {
          ...overallContext.markers[0]!,
          lastValue: 120,
        },
      ],
    });

    expect(original).not.toBe(updated);
  });
});

describe("overall trend insight cache", () => {
  test("saves and retrieves overall insight", () => {
    const db = createTestDb();

    saveCachedOverallTrendInsight(db, overallContext, "Mixed metabolic trend.");

    expect(getCachedOverallTrendInsight(db, overallContext)).toMatchObject({
      content: "Mixed metabolic trend.",
    });
  });

  test("invalidates overall cache when data changes", () => {
    const db = createTestDb();

    saveCachedOverallTrendInsight(db, overallContext, "Old overall.");

    const updated: OverallTrendContext = {
      ...overallContext,
      markers: [
        {
          ...overallContext.markers[0]!,
          lastValue: 120,
        },
      ],
    };

    expect(getCachedOverallTrendInsight(db, updated)).toBeNull();
  });
});
