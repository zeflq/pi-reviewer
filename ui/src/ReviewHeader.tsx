import { marked } from "marked";

interface ReviewHeaderProps {
  source: string;
  ssh: boolean;
  theme: "dark" | "light";
  onThemeToggle: () => void;
  summaryOpen: boolean;
  onSummaryToggle: () => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  decidedCount: number;
  totalComments: number;
  allDone: boolean;
  hasAccepted: boolean;
  onJumpToNext: () => void;
  onAction: (type: string) => void;
  summary: string;
  viewMode: "split" | "unified";
  onViewModeToggle: () => void;
}

export function ReviewHeader({
  source, ssh, theme, onThemeToggle,
  summaryOpen, onSummaryToggle,
  sidebarOpen, onSidebarToggle,
  decidedCount, totalComments, allDone, hasAccepted,
  onJumpToNext, onAction, summary,
  viewMode, onViewModeToggle,
}: ReviewHeaderProps) {
  return (
    <div id="sticky-top">

      {/* ── Row 1: branding + theme ── */}
      <div id="hdr">
        <h1 id="wordmark">
          <svg id="wordmark-pi" width="16" height="17" viewBox="0 0 483.49037 513.25187" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <g transform="translate(-1797.6856,-638.65459)">
              <path fillRule="evenodd" d="m 1878.3698,638.65456 v 256.62051 255.71613 h 107.3769 v -119.1834 c -0.043,-0.057 -0.069,-0.1287 -0.069,-0.2062 V 895.27507 894.9278 c 0,-0.0777 0.026,-0.1494 0.069,-0.2067 v -127.75086 -0.91519 h 107.3682 v 0.91519 127.38964 0.91519 l -0.2724,0.22634 c 0.147,-0.11894 0.3412,0.15252 0.3412,0.34158 v 136.67381 c 0,0.077 -0.026,0.1492 -0.069,0.2062 v 119.1834 h 107.3771 V 894.35988 638.65456 Z" />
              <path fillRule="evenodd" d="m 1797.6856,766.4468 v 63.75889 63.53463 h 1.0485 v 0.22737 h 51.0166 26.033 1.0485 V 830.43617 766.4468 h -1.0485 -24.985 z m 52.0279,63.81005 c 0,10e-4 0.01,0.003 0.01,0.005 0,10e-4 0,0.003 0.01,0.005 0,-0.002 0,-0.003 -0.01,-0.005 0,-0.002 -0.01,-0.003 -0.01,-0.005 z m -24.9629,0.0491 c 0,0.0149 0.01,0.0285 0.015,0.0398 -0.01,-0.0113 -0.013,-0.0249 -0.015,-0.0398 z" />
              <path fillRule="evenodd" d="m 2202.0294,766.4468 v 63.75889 63.53463 h 1.0485 v 0.22737 h 51.0166 26.033 1.0485 V 830.43617 766.4468 h -1.0485 -24.985 z m 52.0279,63.81005 c 0,10e-4 0.01,0.003 0.01,0.005 0,10e-4 0,0.003 0.01,0.005 0,-0.002 0,-0.003 -0.01,-0.005 0,-0.002 -0.01,-0.003 -0.01,-0.005 z m -24.9629,0.0491 c 0,0.0149 0.01,0.0285 0.015,0.0398 -0.01,-0.0113 -0.013,-0.0249 -0.015,-0.0398 z" />
            </g>
          </svg>
          {" "}
          <span>Review</span>
        </h1>
        <button className="icon-btn" onClick={onThemeToggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ color: theme === "dark" ? "#f0b429" : "#79c0ff" }}>
          {theme === "dark" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
      </div>

      {/* ── Row 2: source + actions ── */}
      <div id="hdr2">
        <button className="icon-btn" onClick={onSidebarToggle} title={sidebarOpen ? "Hide file sidebar" : "Show file sidebar"}>
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
        <button className="icon-btn" onClick={onSummaryToggle} title="Summary">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </button>
        <button
          className="icon-btn"
          onClick={onViewModeToggle}
          title={viewMode === "split" ? "Switch to unified view" : "Switch to split view"}
        >
          {viewMode === "split" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>
              <rect x="3" y="3" width="7" height="18" rx="1"/>
              <rect x="14" y="3" width="7" height="18" rx="1"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>
              <rect x="3" y="3" width="18" height="18" rx="1"/>
            </svg>
          )}
        </button>
        <span id="hdr2-sep" />
        <span id="hdr2-source">{source ? (ssh ? `SSH · ${source}` : source) : ""}</span>
        <span id="progress">{decidedCount} / {totalComments} decided</span>
        <button className="icon-btn" disabled={allDone} onClick={onJumpToNext} title="Jump to next undecided comment">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </button>
        <button className="action-btn" disabled={!allDone} onClick={() => onAction("save")} style={{ color: "#79c0ff" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span>Save</span>
        </button>
        <button className="action-btn" disabled={!allDone || !hasAccepted} onClick={() => onAction("send")} style={{ color: "#3fb950" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>Send</span>
        </button>
        <button className="action-btn" disabled={!allDone || !hasAccepted} onClick={() => onAction("save-and-send")} style={{ color: "#3fb950" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span>Save & Send</span>
        </button>
      </div>

      {summaryOpen && (
        <div id="summary">
          <div className="md" dangerouslySetInnerHTML={{ __html: marked(summary) as string }} />
        </div>
      )}

    </div>
  );
}
