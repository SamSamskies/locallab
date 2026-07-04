import type { PanelResponse } from "@shared/schema";
import { formatDate } from "../formatDate";
import { MarkerTable } from "./MarkerTable";

interface PanelViewProps {
  panel: PanelResponse;
  onMarkerClick?: (name: string) => void;
}

export function PanelView({ panel, onMarkerClick }: PanelViewProps) {
  return (
    <div className="card">
      <div className="panel-header">
        <div>
          <h2>{panel.label}</h2>
          <div className="panel-meta">
            {formatDate(panel.collectedAt)} · {panel.markers.length} markers
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

      <MarkerTable markers={panel.markers} onMarkerClick={onMarkerClick} />
    </div>
  );
}
