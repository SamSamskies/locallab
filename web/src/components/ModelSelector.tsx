import type { ModelInfo } from "@shared/schema";

interface ModelSelectorProps {
  models: ModelInfo[];
  value: string;
  onChange: (model: string) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  value,
  onChange,
  loading,
  error,
  disabled,
}: ModelSelectorProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="card-title">Model</div>
        <p className="model-message">Loading models…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-title">Model</div>
        <p className="model-message model-message-error">{error}</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Model</div>
        <p className="model-message">
          No Ollama models found. Pull one first, for example:{" "}
          <code>ollama pull llama3.2</code>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">Model</div>
      <select
        className="model-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select a model…</option>
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
