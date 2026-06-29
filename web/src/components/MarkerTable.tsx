import type { PanelResponse } from "@shared/schema";

interface MarkerTableProps {
  markers: PanelResponse["markers"];
}

function formatValue(value: number | null, unit: string | null): string {
  if (value == null) return "—";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatRef(refLow: number | null, refHigh: number | null, refText: string | null): string {
  if (refText) return refText;
  if (refLow != null && refHigh != null) return `${refLow}–${refHigh}`;
  if (refLow != null) return `≥ ${refLow}`;
  if (refHigh != null) return `≤ ${refHigh}`;
  return "—";
}

export function MarkerTable({ markers }: MarkerTableProps) {
  if (markers.length === 0) {
    return <p className="empty-state">No markers extracted from this panel.</p>;
  }

  return (
    <div className="marker-table-wrap">
      <table className="marker-table">
        <thead>
          <tr>
            <th>Marker</th>
            <th>Value</th>
            <th>Reference</th>
            <th>Status</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {markers.map((m, i) => (
            <tr key={m.id} style={{ animationDelay: `${i * 0.04}s` }}>
              <td className="marker-name">{m.name}</td>
              <td className="marker-value">{formatValue(m.value, m.unit)}</td>
              <td className="marker-ref">
                {formatRef(m.refLow, m.refHigh, m.refText)}
              </td>
              <td>
                <span className={`flag flag-${m.flag}`}>{m.flag}</span>
              </td>
              <td>{m.category ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
