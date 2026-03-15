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

  // Build byFile lookup
  const byFile: Record<string, Array<{ comment: ReviewComment; idx: number }>> = {};
  result.comments.forEach((c: ReviewComment, i: number) => {
    if (!byFile[c.file]) byFile[c.file] = [];
    byFile[c.file].push({ comment: c, idx: i });
  });

  const parsed = parseDiff(rawDiff);

  return (
    <>
      <div id="sticky-top">
      <div id="hdr">
        <span>🔍</span>
        <h1>Pi Review</h1>
        <button className="tbtn" onClick={() => { setSummaryOpen((o) => !o); setFilesOpen(false); }}>
          Summary
        </button>
        <button className="tbtn" onClick={() => { setFilesOpen((o) => !o); setSummaryOpen(false); }}>
          Files ({parsed.length})
        </button>
        <button className="tbtn" onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <span id="progress">
          {decidedCount} / {totalComments} decided
        </span>
        <button className="act-btn" disabled={!allDone} onClick={() => doAction("save")}>
          Save
        </button>
        <button
          className="act-btn primary"
          disabled={!allDone}
          onClick={() => doAction("send")}
        >
          Send to agent
        </button>
        <button
          className="act-btn"
          disabled={!allDone}
          onClick={() => doAction("save-and-send")}
        >
          Save &amp; Send
        </button>
        <span className="info-icon" title="Save: write to pi-review.md — Send: push findings to agent — Save & Send: both">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>
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
