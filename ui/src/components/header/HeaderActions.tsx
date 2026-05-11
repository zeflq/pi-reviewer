import { useState } from "react";
import { SubmitPanel } from "./SubmitPanel";
import { SettingsPanel } from "../panels/SettingsPanel";

interface HeaderActionsProps {
  allDone: boolean;
  hasAccepted: boolean;
  onAction: (type: string, globalComment: string) => void;
  allCollapsed: boolean;
  onToggleCollapse: () => void;
  onSummaryToggle: () => void;
  onContextToggle: () => void;
  contextCount?: number;
}

export function HeaderActions({ allDone, hasAccepted, onAction, allCollapsed, onToggleCollapse, onSummaryToggle, onContextToggle, contextCount }: HeaderActionsProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <span id="hdr2-sep" />
      <button className="finish-btn" disabled={!allDone} onClick={() => setSubmitOpen(true)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Finish review
      </button>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button className="icon-btn" onClick={() => setSettingsOpen((o) => !o)} data-tooltip="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
      <span id="hdr2-sep" />
      <button className="icon-btn" onClick={onToggleCollapse} data-tooltip={allCollapsed ? "Expand all files" : "Collapse all files"}>
        {allCollapsed ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
        )}
      </button>
      <span id="hdr2-sep" />
      <button className="icon-btn icon-btn--active" onClick={onContextToggle} data-tooltip={contextCount ? `Context (${contextCount} files)` : "Context"}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </button>
      <span id="hdr2-sep" />
      <button className="icon-btn" onClick={onSummaryToggle} data-tooltip="Overview">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </button>

      {submitOpen && (
        <SubmitPanel
          hasAccepted={hasAccepted}
          onSubmit={(mode, comment) => { onAction(mode, comment); setSubmitOpen(false); }}
          onClose={() => setSubmitOpen(false)}
        />
      )}
    </>
  );
}
