import type { ModelInfo } from "@shared/schema";

interface ModelSelectorProps {
  models: ModelInfo[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ models, value, onChange, disabled }: ModelSelectorProps) {
  return (
    <div className="card">
      <div className="card-title">Model</div>
      <select
        className="model-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {models.length === 0 ? (
          <option value={value}>{value || "Loading..."}</option>
        ) : (
          models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
              {m.default ? " (default)" : ""}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
