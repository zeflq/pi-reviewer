import { useSettings } from "../../context/SettingsContext";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, availableModels, patchSettings } = useSettings();
  const { viewMode, model, thinking, autoCollapseViewed } = settings;
  const byProvider = groupByProvider(availableModels);

  return (
    <>
      <div className="layout-backdrop" onClick={onClose} />
      <div className="layout-panel" style={{ minWidth: 240 }}>

        <div className="layout-section-label">Layout</div>
        {(["unified", "split"] as const).map((mode) => (
          <button
            key={mode}
            className={`layout-option${viewMode === mode ? " layout-option-active" : ""}`}
            onClick={() => { patchSettings({ viewMode: mode }); onClose(); }}
          >
            {viewMode === mode ? <Checkmark /> : <Spacer />}
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}

        <div className="layout-panel-divider" />
        <div className="layout-section-label">Default model</div>
        <div className="model-list-scroll">
          {availableModels.length === 0 ? (
            <span style={{ padding: "4px 14px", fontSize: 12, color: "var(--text-muted)", display: "block" }}>
              No models available
            </span>
          ) : (
            Object.entries(byProvider).map(([provider, models]) => (
              <div key={provider}>
                <div className="model-provider-label">{provider}</div>
                {models.map((m) => {
                  const id = `${m.provider}/${m.id}`;
                  const isDefault = id === model || m.id === model;
                  return (
                    <button
                      key={id}
                      className={`layout-option${isDefault ? " layout-option-active" : ""}`}
                      onClick={() => { patchSettings({ model: id }); onClose(); }}
                    >
                      {isDefault ? <Checkmark /> : <Spacer />}
                      <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="layout-panel-divider" />
        <div className="layout-section-label">Default thinking</div>
        {THINKING_LEVELS.map((level) => (
          <button
            key={level}
            className={`layout-option${thinking === level ? " layout-option-active" : ""}`}
            onClick={() => { patchSettings({ thinking: level }); onClose(); }}
          >
            {thinking === level ? <Checkmark /> : <Spacer />}
            {level}
          </button>
        ))}

        <div className="layout-panel-divider" />
        <div className="layout-section-label">Behaviour</div>
        <button
          className={`layout-option${autoCollapseViewed ? " layout-option-active" : ""}`}
          onClick={() => patchSettings({ autoCollapseViewed: !autoCollapseViewed })}
        >
          {autoCollapseViewed ? <Checkmark /> : <Spacer />}
          Auto-collapse viewed files
        </button>

      </div>
    </>
  );
}

function groupByProvider(models: ReturnType<typeof useSettings>["availableModels"]) {
  const result: Record<string, typeof models> = {};
  for (const m of models) {
    if (!result[m.provider]) result[m.provider] = [];
    result[m.provider].push(m);
  }
  return result;
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
