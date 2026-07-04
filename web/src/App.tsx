import { useCallback, useEffect, useState } from "react";
import type { PanelListItem, PanelResponse } from "@shared/schema";
import { deletePanel, fetchModels, fetchPanel, fetchPanels, uploadPanel } from "./api";
import { formatDate } from "./formatDate";
import { getStoredModel, setStoredModel } from "./modelStorage";
import { ExtractionProgress } from "./components/ExtractionProgress";
import { ModelSelector } from "./components/ModelSelector";
import { PanelView } from "./components/PanelView";
import { TrendsView } from "./components/TrendsView";
import { UploadDropzone } from "./components/UploadDropzone";

type MainView = "panel" | "trends";

export default function App() {
  const [panels, setPanels] = useState<PanelListItem[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<PanelResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [models, setModels] = useState<{ name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("Extracting markers with local LLM…");
  const [thinkingText, setThinkingText] = useState("");
  const [contentText, setContentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<MainView>("panel");
  const [trendMarker, setTrendMarker] = useState<string | null>(null);

  const loadPanels = useCallback(async () => {
    const list = await fetchPanels();
    setPanels(list);
  }, []);

  const handleModelChange = useCallback((next: string) => {
    setModel(next);
    if (next) {
      setStoredModel(next);
    }
  }, []);

  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m);
        setModelsError(null);
        const stored = getStoredModel();
        if (stored && m.some((entry) => entry.name === stored)) {
          setModel(stored);
        }
      })
      .catch((e) => {
        setModelsError(e instanceof Error ? e.message : "Failed to load models");
      })
      .finally(() => setModelsLoading(false));
    loadPanels().catch(() => {});
  }, [loadPanels]);

  const canUseModel = !modelsLoading && !modelsError && models.length > 0 && Boolean(model);

  const openTrendForMarker = useCallback((name: string) => {
    setTrendMarker(name);
    setView("trends");
  }, []);

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

  const handleDeletePanel = async (id: number) => {
    setError(null);
    try {
      await deletePanel(id);
      if (selectedId === id) {
        setSelectedPanel(null);
        setSelectedId(null);
      }
      await loadPanels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete panel");
    }
  };

  const handleUpload = async (file: File) => {
    if (!model) {
      setError("Select an Ollama model before uploading.");
      return;
    }

    setView("panel");
    setLoading(true);
    setUploadStatus("Reading PDF…");
    setThinkingText("");
    setContentText("");
    setError(null);
    try {
      const panel = await uploadPanel(file, model, (event) => {
        if (event.type === "status") {
          setUploadStatus(event.message);
        } else if (event.type === "token") {
          if (event.phase === "thinking") {
            setThinkingText((prev) => prev + event.content);
          } else {
            setContentText((prev) => prev + event.content);
          }
        }
      });
      setSelectedPanel(panel);
      setSelectedId(panel.id);
      await loadPanels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
      setThinkingText("");
      setContentText("");
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
            onChange={handleModelChange}
            loading={modelsLoading}
            error={modelsError}
            disabled={loading}
          />

          <div className="card">
            <div className="card-title">Upload</div>
            <UploadDropzone onUpload={handleUpload} disabled={loading || !canUseModel} />
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
                        {p.markerCount} markers · {formatDate(p.collectedAt, {})}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="main">
          <div className="tabs" role="tablist" aria-label="Main view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "panel"}
              className={`tab ${view === "panel" ? "active" : ""}`}
              onClick={() => setView("panel")}
            >
              Panel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "trends"}
              className={`tab ${view === "trends" ? "active" : ""}`}
              onClick={() => setView("trends")}
            >
              Trends
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {view === "trends" ? (
            <TrendsView model={model} initialMarker={trendMarker} />
          ) : loading ? (
            <ExtractionProgress
              status={uploadStatus}
              thinkingText={thinkingText}
              contentText={contentText}
            />
          ) : selectedPanel ? (
            <PanelView
              panel={selectedPanel}
              onMarkerClick={openTrendForMarker}
              onDelete={handleDeletePanel}
            />
          ) : (
            <div className="card empty-state">
              <h2>
                {panels.length > 0
                  ? "Select a report in the sidebar or upload a new lab report"
                  : "Upload a lab report to begin"}
              </h2>
         
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
