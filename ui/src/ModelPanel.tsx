import { ModelInfo } from "./types";

interface ModelPanelProps {
  currentModel?: string;
  defaultModel?: string;
  availableModels: ModelInfo[];
  onModelChange: (modelId: string) => void;
  onClose: () => void;
}

export function ModelPanel({ currentModel, defaultModel, availableModels, onModelChange, onClose }: ModelPanelProps) {
  return (
    <>
      <div className="layout-backdrop" onClick={onClose} />
      <div className="layout-panel">
        <div className="layout-section-label">Model</div>
        {availableModels.length === 0 ? (
          <span className="layout-section-label" style={{ fontStyle: "italic" }}>No models available</span>
        ) : (
          availableModels.map((m) => {
            const id = `${m.provider}/${m.id}`;
            const isDefault = id === defaultModel || m.id === defaultModel;
            const isCurrent = id === currentModel || m.id === currentModel;
            return (
              <button
                key={id}
                className={`layout-option${isDefault ? " layout-option-active" : ""}`}
                onClick={() => { onModelChange(id); onClose(); }}
              >
                {isDefault ? <Checkmark /> : <Spacer />}
                <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                {isCurrent && !isDefault && (
                  <span style={{ fontSize: "0.7em", opacity: 0.5, marginLeft: 4 }}>current</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function Checkmark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Spacer() {
  return <span style={{ width: 13, flexShrink: 0, display: "block" }} />;
}
