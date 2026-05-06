import { useState, useCallback, useEffect } from "react";
import { parseDiff } from "./diff-parser";
import { FileDiff } from "./FileDiff";
import { ReviewComment, UIData } from "./types";
import { mockData } from "./mockData";
import { FileTree, buildTree } from "./FileTree";
import { ReviewHeader } from "./ReviewHeader";
import { OrphanComments } from "./OrphanComments";
import { SummaryPanel } from "./SummaryPanel";
import { SettingsProvider } from "./SettingsContext";
import { ScrollToTop } from "./ScrollToTop";

declare global {
  interface Window {
    __DATA__: UIData | null;
  }
  const __APP_VERSION__: string;
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
  const parsed = parseDiff(rawDiff);
  const diffFileSet = new Set(parsed.map((f: { file: string }) => f.file));
  const totalComments = result.comments.length;

  const [decisions, setDecisions] = useState<Record<number, DecisionState>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(data.theme ?? "dark");
  const [viewedFiles, setViewedFiles] = useState<Record<string, boolean>>({});
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({});

  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderPath]: !(prev[folderPath] ?? false) }));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    fetch("/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) }).catch(() => {});
  }, [theme]);

  useEffect(() => {
    const iv = setInterval(() => { fetch("/ping").catch(() => {}); }, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const handler = () => {
      fetch("/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "closed", decisions: [] }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  useEffect(() => {
    const handler = () => setSelectedFile(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    setViewedFiles((prev) => {
      const next = { ...prev };
      let changed = false;
      const fileIdxs: Record<string, number[]> = {};
      result.comments.forEach((c: ReviewComment, i: number) => {
        if (!fileIdxs[c.file]) fileIdxs[c.file] = [];
        fileIdxs[c.file].push(i);
      });
      for (const [file, idxs] of Object.entries(fileIdxs)) {
        if (!prev[file] && idxs.every((i) => decisions[i]?.decision)) {
          next[file] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [decisions]);

  const decidedCount = Object.values(decisions).filter((d) => d.decision).length;
  const allDone = totalComments > 0 && decidedCount === totalComments;
  const hasAccepted = Object.values(decisions).some((d) => d.decision && d.decision !== "reject");

  const severityCounts = result.comments.reduce(
    (acc: Record<string, number>, c: ReviewComment) => {
      const s = (c.severity || "info").toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const [allCollapsed, setAllCollapsed] = useState(false);

  function jumpToNextPending() {
    for (let i = 0; i < totalComments; i++) {
      if (!decisions[i]?.decision) {
        const targetFile = result.comments[i]?.file;
        if (targetFile) setOpenFiles((prev) => ({ ...prev, [targetFile]: true }));
        setTimeout(() => {
          document.getElementById(`cmt-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        return;
      }
    }
  }

  const onDecide = useCallback((idx: number, decision: string, discussText: string) => {
    setDecisions((prev) => ({ ...prev, [idx]: { decision, discussText } }));
  }, []);

  function doAction(type: string, globalComment: string) {
    const list = result.comments.map((_: ReviewComment, i: number) => {
      const d = decisions[i] || {};
      return { index: i, decision: d.decision || "reject", discussText: d.discussText || "" };
    });
    fetch("/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, decisions: list, globalComment }),
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

  const orphanComments = result.comments
    .map((c: ReviewComment, i: number) => ({ comment: c, idx: i }))
    .filter(({ comment }: { comment: ReviewComment }) => !diffFileSet.has(comment.file));

  const commentsByFile: Record<string, number> = Object.fromEntries(
    Object.entries(byFile).map(([file, cmts]) => [file, cmts.length])
  );
  const tree = buildTree(parsed.map((f) => f.file), commentsByFile);

  return (
    <SettingsProvider
      initial={{
        viewMode: data.viewMode ?? "split",
        defaultModel: data.defaultModel,
        defaultThinking: data.defaultThinking,
        autoCollapseViewed: data.autoCollapseViewed ?? false,
      }}
      availableModels={data.availableModels ?? []}
    >
      <ReviewHeader
        source={source}
        ssh={ssh}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((o) => !o)}
        onSummaryToggle={() => setSummaryOpen((o) => !o)}
        decidedCount={decidedCount}
        totalComments={totalComments}
        allDone={allDone}
        hasAccepted={hasAccepted}
        onJumpToNext={jumpToNextPending}
        onAction={doAction}
        summary={result.summary}
        currentModel={data.currentModel}
        currentThinking={data.currentThinking}
        severityCounts={severityCounts}
        allCollapsed={allCollapsed}
        onToggleCollapse={() => setAllCollapsed((c) => !c)}
      />
      <div id="layout">
        {sidebarOpen && (
          <FileTree
            tree={tree}
            collapsedFolders={collapsedFolders}
            toggleFolder={toggleFolder}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
        )}
        <div id="files">
          {totalComments === 0 && (
            <div className="empty-state">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <p>No issues found</p>
              <span>The review came back clean.</span>
            </div>
          )}
          {parsed.length === 0 && totalComments > 0 && (
            <div className="empty-state">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              <p>No diff available</p>
              <span>Comments are shown below as orphans.</span>
            </div>
          )}
          {parsed.map((file, i) => (
            <FileDiff
              key={file.file + i}
              file={file}
              comments={byFile[file.file] || []}
              decisions={decisions}
              onDecide={onDecide}
              selected={file.file === selectedFile}
              forceOpen={openFiles[file.file] ?? false}
              viewed={viewedFiles[file.file] ?? false}
              onToggleViewed={() => setViewedFiles((prev) => ({ ...prev, [file.file]: !prev[file.file] }))}
              collapseSignal={allCollapsed}
            />
          ))}
          <OrphanComments
            comments={orphanComments}
            decisions={decisions}
            onDecide={onDecide}
          />
        </div>
        {summaryOpen && (
          <SummaryPanel summary={result.summary} onClose={() => setSummaryOpen(false)} />
        )}
      </div>
      <ScrollToTop />
    </SettingsProvider>
  );
}
