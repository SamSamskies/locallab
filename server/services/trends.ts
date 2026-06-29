import { and, isNotNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { markers, panels } from "../db/schema";
import type * as schema from "../db/schema";
import type {
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
