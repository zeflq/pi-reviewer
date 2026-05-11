interface LayoutPanelProps {
  viewMode: "split" | "unified";
  onViewModeChange: (mode: "split" | "unified") => void;
  onClose: () => void;
}

export function LayoutPanel({ viewMode, onViewModeChange, onClose }: LayoutPanelProps) {
  return (
    <>
      <div className="layout-backdrop" onClick={onClose} />
      <div className="layout-panel">
        <div className="layout-section-label">Layout</div>
        <button
          className={`layout-option${viewMode === "unified" ? " layout-option-active" : ""}`}
          onClick={() => { onViewModeChange("unified"); onClose(); }}
        >
          {viewMode === "unified" ? <Checkmark /> : <Spacer />}
          Unified
        </button>
        <button
          className={`layout-option${viewMode === "split" ? " layout-option-active" : ""}`}
          onClick={() => { onViewModeChange("split"); onClose(); }}
        >
          {viewMode === "split" ? <Checkmark /> : <Spacer />}
          Split
        </button>
      </div>
    </>
  );
}

function Checkmark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function Spacer() {
  return <span style={{ width: 13, flexShrink: 0, display: "block" }} />;
}
