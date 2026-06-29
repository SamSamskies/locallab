import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { trendInsights } from "../db/schema";
import type * as schema from "../db/schema";
import type { CachedTrendInsight, TrendSeries } from "../shared/schema";

type Database = BetterSQLite3Database<typeof schema>;

export function trendSeriesFingerprint(series: TrendSeries): string {
  return series.points
    .map((p) => `${p.collectedAt}:${p.value}:${p.flag}:${p.refLow}:${p.refHigh}`)
    .join("|");
}

function markerKey(markerName: string): string {
  return markerName.toLowerCase();
}

export function getCachedTrendInsight(
  database: Database,
  markerName: string,
  series: TrendSeries,
): CachedTrendInsight | null {
  const row = database
    .select()
    .from(trendInsights)
    .where(eq(trendInsights.markerKey, markerKey(markerName)))
    .get();

  if (!row) return null;

  const fingerprint = trendSeriesFingerprint(series);
  if (row.dataFingerprint !== fingerprint) return null;

  return {
    content: row.contentText,
    updatedAt: row.updatedAt,
  };
}

export function saveCachedTrendInsight(
  database: Database,
  markerName: string,
  series: TrendSeries,
  content: string,
): CachedTrendInsight {
  const fingerprint = trendSeriesFingerprint(series);
  const updatedAt = new Date().toISOString();
  const key = markerKey(markerName);

  database
    .insert(trendInsights)
    .values({
      markerKey: key,
      contentText: content,
      dataFingerprint: fingerprint,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: trendInsights.markerKey,
      set: {
        contentText: content,
        dataFingerprint: fingerprint,
        updatedAt,
      },
    })
    .run();

  return {
    content,
    updatedAt,
  };
}
