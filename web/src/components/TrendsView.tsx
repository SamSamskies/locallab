import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchCachedOverallTrendInsight,
  fetchCachedTrendInsight,
  fetchOverallTrendInsights,
  fetchTrendInsights,
  fetchTrendMarkers,
  fetchTrendSeries,
} from "../api";
import { formatDate } from "../formatDate";
import { ChatPanel } from "./ChatPanel";
import { MarkdownContent } from "./MarkdownContent";

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

function FlagDot(props: DotProps & { payload?: ChartRow; active?: boolean }) {
  const { cx, cy, payload, active } = props;
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={active ? 6 : 5}
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
      <div className="chart-tooltip-value" style={{ color: flagColor(row.flag) }}>
        {valueText}
      </div>
    </div>
  );
}

interface InsightPanelProps {
  title: string;
  loading: boolean;
  status: string;
  thinkingText: string;
  contentText: string;
  error: string | null;
}

function InsightPanel({
  title,
  loading,
  status,
  thinkingText,
  contentText,
  error,
}: InsightPanelProps) {
  return (
    <div className="trend-insights">
      <div className="trend-insights-header">
        <h3>{title}</h3>
        {loading && <div className="spinner trend-insights-spinner" />}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!error && (
        <div className="trend-insights-body">
          {thinkingText ? (
            <details className="trend-insights-thinking" open={loading}>
              <summary>Model reasoning</summary>
              <pre>{thinkingText}</pre>
            </details>
          ) : null}
          {contentText ? (
            <MarkdownContent content={contentText} />
          ) : loading ? (
            <p className="trend-insights-waiting">{status}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

type TrendsSubTab = "overall" | "marker";

interface TrendsViewProps {
  model: string;
  initialMarker?: string | null;
}

function resolveMarkerName(markers: TrendMarkerSummary[], name: string): string | null {
  const match = markers.find((m) => m.name.toLowerCase() === name.toLowerCase());
  return match?.name ?? null;
}

export function TrendsView({ model, initialMarker }: TrendsViewProps) {
  const [subTab, setSubTab] = useState<TrendsSubTab>(initialMarker ? "marker" : "overall");
  const [markers, setMarkers] = useState<TrendMarkerSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [series, setSeries] = useState<TrendSeries | null>(null);
  const [loadingMarkers, setLoadingMarkers] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightStatus, setInsightStatus] = useState("");
  const [thinkingText, setThinkingText] = useState("");
  const [contentText, setContentText] = useState("");
  const [insightError, setInsightError] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [hasCachedInsight, setHasCachedInsight] = useState(false);
  const [loadingCachedInsight, setLoadingCachedInsight] = useState(false);
  const insightStreamRef = useRef<AbortController | null>(null);

  const [overallInsightLoading, setOverallInsightLoading] = useState(false);
  const [overallInsightStatus, setOverallInsightStatus] = useState("");
  const [overallThinkingText, setOverallThinkingText] = useState("");
  const [overallContentText, setOverallContentText] = useState("");
  const [overallInsightError, setOverallInsightError] = useState<string | null>(null);
  const [showOverallInsights, setShowOverallInsights] = useState(false);
  const [hasCachedOverallInsight, setHasCachedOverallInsight] = useState(false);
  const [loadingCachedOverallInsight, setLoadingCachedOverallInsight] = useState(false);
  const overallInsightStreamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    insightStreamRef.current?.abort();
    insightStreamRef.current = null;
    setInsightLoading(false);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    setLoadingMarkers(true);
    setError(null);

    fetchTrendMarkers()
      .then((list) => {
        if (cancelled) return;
        setMarkers(list);
        if (list.length > 0) {
          const fromNav = initialMarker ? resolveMarkerName(list, initialMarker) : null;
          setSelected(fromNav ?? pickDefaultMarker(list));
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
    if (!initialMarker || markers.length === 0) return;
    const resolved = resolveMarkerName(markers, initialMarker);
    if (resolved) {
      setSelected(resolved);
      setSubTab("marker");
    }
  }, [initialMarker, markers]);

  useEffect(() => {
    if (markers.length === 0) {
      setShowOverallInsights(false);
      setHasCachedOverallInsight(false);
      setOverallThinkingText("");
      setOverallContentText("");
      setOverallInsightError(null);
      return;
    }

    let cancelled = false;
    setLoadingCachedOverallInsight(true);
    setOverallInsightError(null);

    fetchCachedOverallTrendInsight()
      .then((cached) => {
        if (cancelled) return;
        if (cached) {
          setShowOverallInsights(true);
          setHasCachedOverallInsight(true);
          setOverallThinkingText("");
          setOverallContentText(cached.content);
        } else {
          setShowOverallInsights(false);
          setHasCachedOverallInsight(false);
          setOverallThinkingText("");
          setOverallContentText("");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setOverallInsightError(
          e instanceof Error ? e.message : "Failed to load cached overall insights",
        );
        setShowOverallInsights(false);
        setHasCachedOverallInsight(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingCachedOverallInsight(false);
      });

    return () => {
      cancelled = true;
    };
  }, [markers]);

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

  useEffect(() => {
    if (!selected || !series || series.points.length === 0) {
      setShowInsights(false);
      setHasCachedInsight(false);
      setThinkingText("");
      setContentText("");
      setInsightError(null);
      return;
    }

    let cancelled = false;
    setLoadingCachedInsight(true);
    setInsightError(null);

    fetchCachedTrendInsight(selected)
      .then((cached) => {
        if (cancelled) return;
        if (cached) {
          setShowInsights(true);
          setHasCachedInsight(true);
          setThinkingText("");
          setContentText(cached.content);
        } else {
          setShowInsights(false);
          setHasCachedInsight(false);
          setThinkingText("");
          setContentText("");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setInsightError(e instanceof Error ? e.message : "Failed to load cached insights");
        setShowInsights(false);
        setHasCachedInsight(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingCachedInsight(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, series]);

  const chartRows = useMemo(
    () => (series ? toChartRows(series) : []),
    [series],
  );
  const { refLow, refHigh } = useMemo(() => latestRefRange(chartRows), [chartRows]);
  const unit = chartRows[0]?.unit ?? markers.find((m) => m.name === selected)?.units[0] ?? null;

  const handleGetOverallInsights = async () => {
    if (markers.length === 0 || !model) return;

    overallInsightStreamRef.current?.abort();
    const controller = new AbortController();
    overallInsightStreamRef.current = controller;

    setShowOverallInsights(true);
    setOverallInsightLoading(true);
    setOverallInsightStatus("Analyzing overall health trends with local LLM…");
    setOverallThinkingText("");
    setOverallContentText("");
    setOverallInsightError(null);

    try {
      await fetchOverallTrendInsights(
        model,
        (event) => {
          if (controller.signal.aborted) return;

          if (event.type === "status") {
            setOverallInsightStatus(event.message);
          } else if (event.type === "token") {
            if (event.phase === "thinking") {
              setOverallThinkingText((prev) => prev + event.content);
            } else {
              setOverallContentText((prev) => prev + event.content);
            }
          }
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setHasCachedOverallInsight(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      setOverallInsightError(
        e instanceof Error ? e.message : "Failed to generate overall insights",
      );
    } finally {
      if (overallInsightStreamRef.current === controller) {
        overallInsightStreamRef.current = null;
      }
      if (!controller.signal.aborted) {
        setOverallInsightLoading(false);
      }
    }
  };

  const handleGetInsights = async () => {
    if (!selected || chartRows.length === 0 || !model) return;

    const marker = selected;
    insightStreamRef.current?.abort();
    const controller = new AbortController();
    insightStreamRef.current = controller;

    setShowInsights(true);
    setInsightLoading(true);
    setInsightStatus("Analyzing trend with local LLM…");
    setThinkingText("");
    setContentText("");
    setInsightError(null);

    try {
      await fetchTrendInsights(
        marker,
        model,
        (event) => {
          if (controller.signal.aborted) return;

          if (event.type === "status") {
            setInsightStatus(event.message);
          } else if (event.type === "token") {
            if (event.phase === "thinking") {
              setThinkingText((prev) => prev + event.content);
            } else {
              setContentText((prev) => prev + event.content);
            }
          }
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setHasCachedInsight(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      setInsightError(e instanceof Error ? e.message : "Failed to generate insights");
    } finally {
      if (insightStreamRef.current === controller) {
        insightStreamRef.current = null;
      }
      if (!controller.signal.aborted) {
        setInsightLoading(false);
      }
    }
  };

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
        <div className="tabs trends-subtabs" role="tablist" aria-label="Trends view">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "overall"}
            className={`tab ${subTab === "overall" ? "active" : ""}`}
            onClick={() => setSubTab("overall")}
          >
            Overall
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "marker"}
            className={`tab ${subTab === "marker" ? "active" : ""}`}
            onClick={() => setSubTab("marker")}
          >
            By marker
          </button>
        </div>
      </div>

      {subTab === "overall" ? (
        <section className="overall-health-section">
          <div className="overall-health-header">
            <p className="overall-health-meta">
              Cross-marker patterns across your uploaded panels
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGetOverallInsights}
              disabled={overallInsightLoading || loadingCachedOverallInsight || !model}
            >
              {overallInsightLoading
                ? "Generating insights…"
                : hasCachedOverallInsight
                  ? "Refresh insights"
                  : "Get insights"}
            </button>
          </div>
          {showOverallInsights ? (
            <InsightPanel
              title="Overall health insights"
              loading={overallInsightLoading}
              status={overallInsightStatus}
              thinkingText={overallThinkingText}
              contentText={overallContentText}
              error={overallInsightError}
            />
          ) : (
            <p className="overall-health-empty">
              Generate insights to see how markers are moving together over time.
            </p>
          )}
        </section>
      ) : (
        <>
          <div className="trends-marker-header">
            <select
              className="model-select trends-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Marker"
            >
              {markers.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({m.dataPointCount})
                </option>
              ))}
            </select>
            {chartRows.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGetInsights}
                disabled={insightLoading || loadingCachedInsight || !model}
              >
                {insightLoading
                  ? "Generating insights…"
                  : hasCachedInsight
                    ? "Refresh insights"
                    : "Get insights"}
              </button>
            )}
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
            <>
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
                        fill="var(--ref-range-fill)"
                        stroke="var(--ref-range-stroke)"
                        strokeWidth={1}
                      />
                    )}
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--chart-line)"
                      strokeWidth={2}
                      dot={<FlagDot />}
                      activeDot={<FlagDot active />}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {showInsights && (
                <InsightPanel
                  title="Trend insights"
                  loading={insightLoading}
                  status={insightStatus}
                  thinkingText={thinkingText}
                  contentText={contentText}
                  error={insightError}
                />
              )}

              {selected && (
                <ChatPanel contextType="trend" contextKey={selected} model={model} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
