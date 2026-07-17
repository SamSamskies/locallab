import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { trendInsights } from "../db/schema";
import type * as schema from "../db/schema";
import type {
  CachedTrendInsight,
  OverallTrendContext,
  TrendSeries,
} from "../shared/schema";

type Database = BetterSQLite3Database<typeof schema>;

/** Reserved cache key for cross-marker overall health insights. */
export const OVERALL_TREND_INSIGHT_KEY = "__overall__";

export function trendSeriesFingerprint(series: TrendSeries): string {
  return series.points
    .map((p) => `${p.collectedAt}:${p.value}:${p.flag}:${p.refLow}:${p.refHigh}`)
    .join("|");
}

export function overallTrendFingerprint(context: OverallTrendContext): string {
  const visitPart = context.visits
    .map((v) => `${v.panelId}:${v.collectedAt}:${v.summary ?? ""}:${v.insights.join(",")}`)
    .join("|");
  const markerPart = context.markers
    .map(
      (m) =>
        `${m.name.toLowerCase()}:${m.firstCollectedAt}:${m.firstValue}:${m.firstFlag}:${m.lastCollectedAt}:${m.lastValue}:${m.lastFlag}:${m.latestRefLow}:${m.latestRefHigh}`,
    )
    .join("|");
  return `${visitPart}||${markerPart}`;
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

export function getCachedOverallTrendInsight(
  database: Database,
  context: OverallTrendContext,
): CachedTrendInsight | null {
  const row = database
    .select()
    .from(trendInsights)
    .where(eq(trendInsights.markerKey, OVERALL_TREND_INSIGHT_KEY))
    .get();

  if (!row) return null;

  const fingerprint = overallTrendFingerprint(context);
  if (row.dataFingerprint !== fingerprint) return null;

  return {
    content: row.contentText,
    updatedAt: row.updatedAt,
  };
}

export function saveCachedOverallTrendInsight(
  database: Database,
  context: OverallTrendContext,
  content: string,
): CachedTrendInsight {
  const fingerprint = overallTrendFingerprint(context);
  const updatedAt = new Date().toISOString();

  database
    .insert(trendInsights)
    .values({
      markerKey: OVERALL_TREND_INSIGHT_KEY,
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
