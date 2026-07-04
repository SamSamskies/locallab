import { useState } from "react";
import type { PanelResponse } from "@shared/schema";
import { exportPanelJson } from "../exportPanelJson";
import { formatDate } from "../formatDate";
import { MarkerTable } from "./MarkerTable";

interface PanelViewProps {
  panel: PanelResponse;
  onMarkerClick?: (name: string) => void;
  onDelete?: (id: number) => Promise<void> | void;
}

export function PanelView({ panel, onMarkerClick, onDelete }: PanelViewProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="card">
      <div className="panel-header">
        <div>
          <h2>{panel.label}</h2>
          <div className="panel-meta">
            {formatDate(panel.collectedAt)} · {panel.markers.length} markers
          </div>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => exportPanelJson(panel)}
          >
            Export JSON
          </button>
          {onDelete &&
            (confirming ? (
              <div className="panel-delete-confirm">
                <span>Delete this report permanently?</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void onDelete(panel.id)}
                >
                  Delete
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirming(true)}
              >
                Delete
              </button>
            ))}
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
