import type { PanelResponse } from "@shared/schema";
import { MarkerTable } from "./MarkerTable";

interface PanelViewProps {
  panel: PanelResponse;
}

function formatDate(value: string | null): string {
  if (!value) return "Date unknown";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PanelView({ panel }: PanelViewProps) {
  return (
    <div className="card">
      <div className="panel-header">
        <div>
          <h2>{panel.label}</h2>
          <div className="panel-meta">
            {formatDate(panel.collectedAt)} · {panel.sourceFilename} ·{" "}
            {panel.markers.length} markers
          </div>
        </div>
      </div>

      {panel.summary && <div className="summary">{panel.summary}</div>}

      {panel.insights.length > 0 && (
        <ul className="insights">
          {panel.insights.map((insight, i) => (
            <li key={i} style={{ animationDelay: `${i * 0.06}s` }}>
              {insight}
            </li>
          ))}
        </ul>
      )}

      <MarkerTable markers={panel.markers} />
    </div>
  );
}
