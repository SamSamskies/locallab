import type { PanelResponse } from "@shared/schema";
import { MarkerTable } from "./MarkerTable";

interface PanelViewProps {
  panel: PanelResponse;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Date unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
