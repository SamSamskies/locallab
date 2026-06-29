import { useEffect, useMemo, useState } from "react";
import type { TrendMarkerSummary, TrendSeries } from "@shared/schema";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DotProps } from "recharts";
import { fetchTrendMarkers, fetchTrendSeries } from "../api";
import { formatDate } from "../formatDate";

const FLAG_COLORS: Record<string, string> = {
  low: "#e8a838",
  normal: "#5a9e6f",
  high: "#d94f4f",
  unknown: "#7a756c",
};

type ChartRow = {
  date: string;
  value: number;
  refLow: number | null;
  refHigh: number | null;
  flag: string;
  panelLabel: string;
  unit: string | null;
};

function flagColor(flag: string): string {
  return FLAG_COLORS[flag] ?? FLAG_COLORS.unknown;
}

function FlagDot(props: DotProps & { payload?: ChartRow }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={flagColor(payload?.flag ?? "unknown")}
      stroke="var(--bg-surface)"
      strokeWidth={2}
    />
  );
}

function pickDefaultMarker(markers: TrendMarkerSummary[]): string {
  if (markers.length === 0) return "";
  return markers.reduce((best, m) =>
    m.dataPointCount > best.dataPointCount ? m : best,
  ).name;
}

function toChartRows(series: TrendSeries): ChartRow[] {
  return series.points.map((p) => ({
    date: formatDate(p.collectedAt, { month: "short", year: "numeric" }),
    value: p.value,
    refLow: p.refLow,
    refHigh: p.refHigh,
    flag: p.flag,
    panelLabel: p.panelLabel,
    unit: p.unit,
  }));
}

function latestRefRange(rows: ChartRow[]): { refLow: number | null; refHigh: number | null } {
  const latest = rows[rows.length - 1];
  if (!latest) return { refLow: null, refHigh: null };
  return { refLow: latest.refLow, refHigh: latest.refHigh };
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  const formatted =
    Number.isInteger(row.value) ? String(row.value) : row.value.toFixed(2);
  const valueText = row.unit ? `${formatted} ${row.unit}` : formatted;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{row.panelLabel}</div>
      <div className="chart-tooltip-date">{row.date}</div>
      <div className="chart-tooltip-value">{valueText}</div>
    </div>
  );
}

export function TrendsView() {
  const [markers, setMarkers] = useState<TrendMarkerSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [series, setSeries] = useState<TrendSeries | null>(null);
  const [loadingMarkers, setLoadingMarkers] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingMarkers(true);
    setError(null);

    fetchTrendMarkers()
      .then((list) => {
        if (cancelled) return;
        setMarkers(list);
        if (list.length > 0) {
          setSelected(pickDefaultMarker(list));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load markers");
      })
      .finally(() => {
        if (!cancelled) setLoadingMarkers(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setSeries(null);
      return;
    }

    let cancelled = false;
    setLoadingSeries(true);
    setError(null);

    fetchTrendSeries(selected)
      .then((data) => {
        if (cancelled) return;
        setSeries(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load trend data");
        setSeries(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const chartRows = useMemo(
    () => (series ? toChartRows(series) : []),
    [series],
  );
  const { refLow, refHigh } = useMemo(() => latestRefRange(chartRows), [chartRows]);
  const unit = chartRows[0]?.unit ?? markers.find((m) => m.name === selected)?.units[0] ?? null;

  if (loadingMarkers) {
    return (
      <div className="card loading">
        <div className="spinner" />
        <p>Loading markers…</p>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="card empty-state">
        <h2>No trend data yet</h2>
        <p>Upload more panels to see trends across markers over time.</p>
      </div>
    );
  }

  return (
    <div className="card chart-card">
      <div className="trends-header">
        <div>
          <h2>Trends</h2>
          <div className="panel-meta">Values across uploaded panels</div>
        </div>
        <select
          className="model-select trends-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {markers.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.dataPointCount})
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loadingSeries ? (
        <div className="loading chart-loading">
          <div className="spinner" />
        </div>
      ) : chartRows.length === 0 ? (
        <p className="empty-state" style={{ padding: "2rem 0" }}>
          No data points for this marker.
        </p>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="var(--border-strong)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
                label={
                  unit
                    ? {
                        value: unit,
                        angle: -90,
                        position: "insideLeft",
                        fill: "var(--text-muted)",
                        fontSize: 12,
                      }
                    : undefined
                }
              />
              {refLow != null && refHigh != null && (
                <ReferenceArea
                  y1={refLow}
                  y2={refHigh}
                  fill="rgba(90, 158, 111, 0.12)"
                  stroke="none"
                />
              )}
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={<FlagDot />}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
