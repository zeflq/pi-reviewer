import { useState } from "react";
import { SubmitPanel } from "./SubmitPanel";
import { LayoutPanel } from "./LayoutPanel";

interface ReviewHeaderProps {
  source?: string;
  ssh?: boolean;
  theme: "dark" | "light";
  onThemeToggle: () => void;
  onSummaryToggle: () => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  decidedCount: number;
  totalComments: number;
  allDone: boolean;
  hasAccepted: boolean;
  onJumpToNext: () => void;
  onAction: (type: string, globalComment: string) => void;
  summary: string;
  viewMode: "split" | "unified";
  onViewModeChange: (mode: "split" | "unified") => void;
}

export function ReviewHeader({
  source, ssh, theme, onThemeToggle,
  onSummaryToggle, sidebarOpen, onSidebarToggle,
  decidedCount, totalComments, allDone, hasAccepted,
  onJumpToNext, onAction, summary,
  viewMode, onViewModeChange,
}: ReviewHeaderProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);

  return (
    <div id="sticky-top">

      {/* ── Row 1: branding + theme ── */}
      <div id="hdr">
        <h1 id="wordmark">
          <svg id="wordmark-pi" width="18" height="17" viewBox="0 0 479.69892 437.48338" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <g transform="translate(-1798.4221,-369.84875)">
              <path fillRule="evenodd" d="m 1877.3433,369.84874 v 218.73704 109.76229 h -0.5302 -24.985 -53.1131 v 54.19049 54.00032 h 1.0485 v 0.19327 h 51.0166 26.033 1.0485 v -0.18035 h 106.8586 V 704.96317 c -0.043,-0.049 -0.069,-0.10972 -0.069,-0.17622 v -116.20117 -0.29611 c 0,-0.066 0.026,-0.12731 0.069,-0.17621 V 479.22191 478.4416 h 107.3681 v 0.78031 108.58355 0.78032 l -0.2723,0.19275 c 0.1469,-0.1014 0.3411,0.13026 0.3411,0.29146 v 116.49728 c 0,0.065 -0.026,0.1272 -0.069,0.1757 v 101.58915 h 107.3774 v -0.37672 h 0.5571 v 0.19275 h 51.0165 26.0331 0.9012 0.1473 v -53.99722 -54.38635 h -0.1473 -0.9012 -24.9851 -52.6216 V 587.80546 369.84874 Z m -78.9213,105.35688 v 108.38356 h 49.5841 26.033 1.0485 v -53.99722 -54.38634 h -1.0485 -24.985 z m 403.4069,0 v 54.19049 53.9998 h 1.0485 v 0.19327 h 51.0165 24.0797 V 475.20562 h -23.0317 z" />
            </g>
          </svg>
          {" "}
          <span>Review</span>
        </h1>
        <button className="icon-btn" onClick={onThemeToggle} data-tooltip={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ color: theme === "dark" ? "#f0b429" : "#79c0ff" }}>
          {theme === "dark" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
      </div>

      {/* ── Row 2: source + actions ── */}
      <div id="hdr2">
        <button className="icon-btn" onClick={onSidebarToggle} data-tooltip={sidebarOpen ? "Hide file sidebar" : "Show file sidebar"}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
            {sidebarOpen
              ? <polyline points="10 9 7 12 10 15"/>
              : <polyline points="7 9 10 12 7 15"/>}
          </svg>
        </button>
        <span id="hdr2-sep" />
        <span id="hdr2-source">{source ? (ssh ? `SSH · ${source}` : source) : ""}</span>
        <span id="progress">{decidedCount} / {totalComments} decided</span>
        <button className="icon-btn" disabled={allDone} onClick={onJumpToNext} data-tooltip="Jump to next undecided comment">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </button>
        <span id="hdr2-sep" />
        <button
          className="finish-btn"
          disabled={!allDone}
          onClick={() => setSubmitOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Finish review
        </button>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <button className="icon-btn" onClick={() => setLayoutOpen((o) => !o)} data-tooltip="Layout settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          {layoutOpen && (
            <LayoutPanel
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              onClose={() => setLayoutOpen(false)}
            />
          )}
        </div>
        <span id="hdr2-sep" />
        <button className="icon-btn" onClick={onSummaryToggle} data-tooltip="Overview">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </button>
      </div>

      {submitOpen && (
        <SubmitPanel
          hasAccepted={hasAccepted}
          onSubmit={(mode, comment) => { onAction(mode, comment); setSubmitOpen(false); }}
          onClose={() => setSubmitOpen(false)}
        />
      )}

    </div>
  );
}
