import { and, asc, inArray, isNotNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { markers, panels } from "../db/schema";
import type * as schema from "../db/schema";
import type {
  OverallTrendContext,
  OverallTrendMarker,
  OverallTrendVisit,
  TrendMarkerSummary,
  TrendPoint,
  TrendSeries,
} from "../shared/schema";
import { markerFlagSchema } from "../shared/schema";

type Database = BetterSQLite3Database<typeof schema>;

type TrendRow = {
  panelId: number;
  panelLabel: string;
  collectedAt: string;
  name: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: string;
  category: string | null;
};

function toFlag(flag: string): TrendPoint["flag"] {
  const parsed = markerFlagSchema.safeParse(flag);
  return parsed.success ? parsed.data : "unknown";
}

function fetchTrendRows(database: Database, markerName?: string): TrendRow[] {
  const conditions = [isNotNull(panels.collectedAt), isNotNull(markers.value)];

  if (markerName !== undefined) {
    conditions.push(sql`lower(${markers.name}) = ${markerName.toLowerCase()}`);
  }

  return database
    .select({
      panelId: panels.id,
      panelLabel: panels.label,
      collectedAt: panels.collectedAt,
      name: markers.name,
      value: markers.value,
      unit: markers.unit,
      refLow: markers.refLow,
      refHigh: markers.refHigh,
      refText: markers.refText,
      flag: markers.flag,
      category: markers.category,
    })
    .from(markers)
    .innerJoin(panels, sql`${markers.panelId} = ${panels.id}`)
    .where(and(...conditions))
    .all()
    .map((row) => ({
      ...row,
      collectedAt: row.collectedAt!,
      value: row.value!,
    }));
}

function toTrendPoint(row: TrendRow): TrendPoint {
  return {
    panelId: row.panelId,
    panelLabel: row.panelLabel,
    collectedAt: row.collectedAt,
    value: row.value,
    unit: row.unit,
    refLow: row.refLow,
    refHigh: row.refHigh,
    refText: row.refText,
    flag: toFlag(row.flag),
    category: row.category,
  };
}

export function getTrendMarkers(database: Database): TrendMarkerSummary[] {
  const rows = fetchTrendRows(database);
  const grouped = new Map<string, TrendRow[]>();

  for (const row of rows) {
    const key = row.name.toLowerCase();
    const group = grouped.get(key);
    if (group) {
      group.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  const summaries: TrendMarkerSummary[] = [];

  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
    const latest = sorted[sorted.length - 1]!;
    const units = [...new Set(sorted.map((row) => row.unit).filter((unit): unit is string => unit != null))].sort();

    summaries.push({
      name: latest.name,
      units,
      category: latest.category,
      dataPointCount: sorted.length,
      firstCollectedAt: sorted[0]!.collectedAt,
      lastCollectedAt: latest.collectedAt,
      latestValue: latest.value,
      latestRefLow: latest.refLow,
      latestRefHigh: latest.refHigh,
      latestFlag: toFlag(latest.flag),
    });
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function getTrendSeries(database: Database, markerName: string): TrendSeries {
  const rows = fetchTrendRows(database, markerName).sort((a, b) =>
    a.collectedAt.localeCompare(b.collectedAt),
  );

  return {
    marker: markerName,
    points: rows.map(toTrendPoint),
  };
}

function parseInsightsJson(insightsJson: string | null): string[] {
  if (!insightsJson) return [];
  try {
    const parsed: unknown = JSON.parse(insightsJson);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function getOverallTrendContext(database: Database): OverallTrendContext {
  const rows = fetchTrendRows(database);
  const panelIds = [...new Set(rows.map((row) => row.panelId))];

  const visits: OverallTrendVisit[] =
    panelIds.length === 0
      ? []
      : database
          .select({
            panelId: panels.id,
            panelLabel: panels.label,
            collectedAt: panels.collectedAt,
            summary: panels.summary,
            insightsJson: panels.insightsJson,
          })
          .from(panels)
          .where(and(isNotNull(panels.collectedAt), inArray(panels.id, panelIds)))
          .orderBy(asc(panels.collectedAt))
          .all()
          .filter((row): row is typeof row & { collectedAt: string } => row.collectedAt != null)
          .map((row) => ({
            panelId: row.panelId,
            panelLabel: row.panelLabel,
            collectedAt: row.collectedAt,
            summary: row.summary,
            insights: parseInsightsJson(row.insightsJson),
          }));

  const grouped = new Map<string, TrendRow[]>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    const group = grouped.get(key);
    if (group) {
      group.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  const overallMarkers: OverallTrendMarker[] = [];
  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
    const first = sorted[0]!;
    const latest = sorted[sorted.length - 1]!;
    const units = sorted.map((row) => row.unit).filter((unit): unit is string => unit != null);

    overallMarkers.push({
      name: latest.name,
      category: latest.category,
      unit: units[units.length - 1] ?? null,
      dataPointCount: sorted.length,
      firstCollectedAt: first.collectedAt,
      lastCollectedAt: latest.collectedAt,
      firstValue: first.value,
      lastValue: latest.value,
      firstFlag: toFlag(first.flag),
      lastFlag: toFlag(latest.flag),
      latestRefLow: latest.refLow,
      latestRefHigh: latest.refHigh,
      latestRefText: latest.refText,
    });
  }

  overallMarkers.sort((a, b) => a.name.localeCompare(b.name));

  return { visits, markers: overallMarkers };
}
