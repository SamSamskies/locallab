import { useCallback, useEffect, useState } from "react";
import type { PanelListItem, PanelResponse } from "@shared/schema";
import { fetchModels, fetchPanel, fetchPanels, uploadPanel } from "./api";
import { ModelSelector } from "./components/ModelSelector";
import { PanelView } from "./components/PanelView";
import { UploadDropzone } from "./components/UploadDropzone";

export default function App() {
  const [panels, setPanels] = useState<PanelListItem[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<PanelResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [models, setModels] = useState<{ name: string; default: boolean }[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPanels = useCallback(async () => {
    const list = await fetchPanels();
    setPanels(list);
  }, []);

  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m);
        const def = m.find((x) => x.default) ?? m[0];
        if (def) setModel(def.name);
      })
      .catch(() => {
        setModel("qwen3.6:27b");
      });
    loadPanels().catch(() => {});
  }, [loadPanels]);

  const selectPanel = async (id: number) => {
    setSelectedId(id);
    setError(null);
    try {
      const panel = await fetchPanel(id);
      setSelectedPanel(panel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load panel");
    }
  };

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const panel = await uploadPanel(file, model || undefined);
      setSelectedPanel(panel);
      setSelectedId(panel.id);
      await loadPanels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>
            Local<span>Lab</span>
          </h1>
          <p>Private blood work analysis — runs entirely on your machine</p>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <ModelSelector
            models={models}
            value={model}
            onChange={setModel}
            disabled={loading}
          />

          <div className="card">
            <div className="card-title">Upload</div>
            <UploadDropzone onUpload={handleUpload} disabled={loading} />
          </div>

          <div className="card">
            <div className="card-title">History</div>
            {panels.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No panels yet
              </p>
            ) : (
              <ul className="panel-list">
                {panels.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`panel-item ${selectedId === p.id ? "active" : ""}`}
                      onClick={() => selectPanel(p.id)}
                    >
                      <div className="panel-item-title">{p.label}</div>
                      <div className="panel-item-meta">
                        {p.markerCount} markers ·{" "}
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="main">
          {error && <div className="error-banner">{error}</div>}

          {loading ? (
            <div className="card loading">
              <div className="spinner" />
              <p>Extracting markers with local LLM…</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Large models may take a minute or two
              </p>
            </div>
          ) : selectedPanel ? (
            <PanelView panel={selectedPanel} />
          ) : (
            <div className="card empty-state">
              <h2>Upload a lab report to begin</h2>
              <p>
                Drop a text-based PDF on the left. LocalLab will extract your markers,
                flag out-of-range values, and generate plain-language insights — all
                without sending data to the cloud.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
