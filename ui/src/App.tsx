import { useState, useCallback, useEffect } from "react";
import { marked } from "marked";
import { parseDiff } from "./diff-parser";
import { FileDiff } from "./FileDiff";
import { ReviewComment, UIData } from "./types";
import { mockData } from "./mockData";

declare global {
  interface Window {
    __DATA__: UIData | null;
  }
}

interface DecisionState {
  decision: string;
  discussText: string;
}

export default function App() {
  const data = window.__DATA__ ?? mockData;
  const result = data.result;
  const rawDiff = data.diff;
  const source = data.source;
  const ssh = data.ssh;
  const totalComments = result.comments.length;

  const [decisions, setDecisions] = useState<Record<number, DecisionState>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("pi-theme") as "dark" | "light") ?? "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pi-theme", theme);
  }, [theme]);

  const decidedCount = Object.values(decisions).filter((d) => d.decision).length;
  const allDone = totalComments > 0 && decidedCount === totalComments;
  const hasAccepted = Object.values(decisions).some((d) => d.decision && d.decision !== "reject");

  const onDecide = useCallback(
    (idx: number, decision: string, discussText: string) => {
      setDecisions((prev) => {
        const next = { ...prev };
        next[idx] = { decision, discussText };
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const iv = setInterval(() => {
      fetch("/ping").catch(() => {});
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  function doAction(type: string) {
    const list = result.comments.map((_: ReviewComment, i: number) => {
      const d = decisions[i] || {};
      return { index: i, decision: d.decision || "reject", discussText: d.discussText || "" };
    });
    fetch("/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, decisions: list }),
    }).then(() => setSubmitted(true));
  }

  if (submitted) {
    return <p className="done-msg">Done &mdash; you can close this tab.</p>;
  }

  const byFile: Record<string, Array<{ comment: ReviewComment; idx: number }>> = {};
  result.comments.forEach((c: ReviewComment, i: number) => {
    if (!byFile[c.file]) byFile[c.file] = [];
    byFile[c.file].push({ comment: c, idx: i });
  });

  const parsed = parseDiff(rawDiff);

  return (
    <>
      <div id="sticky-top">

        {/* ── Row 1: branding + navigation ── */}
        <div id="hdr">
          <h1 id="wordmark"><span id="wordmark-pi">π</span> review</h1>
          <button className="tbtn" onClick={() => { setSummaryOpen((o) => !o); setFilesOpen(false); }}>
            Summary
          </button>
          <button className="tbtn" onClick={() => { setFilesOpen((o) => !o); setSummaryOpen(false); }}>
            Files ({parsed.length})
          </button>
          <button className="icon-btn" onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>

        {/* ── Row 2: source + actions ── */}
        <div id="hdr2">
          <span id="hdr2-source">{source ? (ssh ? `SSH · ${source}` : source) : ""}</span>
          <span id="progress">{decidedCount} / {totalComments} decided</span>
          <button className="action-btn" disabled={!allDone} onClick={() => doAction("save")}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>Save</span>
          </button>
          <button className="action-btn" disabled={!allDone || !hasAccepted} onClick={() => doAction("send")}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>Send</span>
          </button>
          <button className="action-btn" disabled={!allDone || !hasAccepted} onClick={() => doAction("save-and-send")}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            <span>Save & Send</span>
          </button>
        </div>

        {/* ── Dropdowns (positioned relative to #sticky-top) ── */}
        {summaryOpen && (
          <div id="summary">
            <div className="md" dangerouslySetInnerHTML={{ __html: marked(result.summary) as string }} />
          </div>
        )}
        {filesOpen && (
          <div id="file-nav">
            {parsed.map((file) => {
              const count = (byFile[file.file] || []).length;
              return (
                <a
                  key={file.file}
                  className="file-nav-item"
                  href={`#file-${CSS.escape(file.file)}`}
                  onClick={() => setFilesOpen(false)}
                >
                  <span className="file-nav-name">{file.file}</span>
                  {count > 0 && <span className="cbadge">{count}</span>}
                </a>
              );
            })}
          </div>
        )}

      </div>
      <div id="files">
        {parsed.map((file, i) => (
          <FileDiff
            key={file.file + i}
            file={file}
            comments={byFile[file.file] || []}
            decisions={decisions}
            onDecide={onDecide}
          />
        ))}
      </div>
    </>
  );
}
