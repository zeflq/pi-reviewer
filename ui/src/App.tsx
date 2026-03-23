import { useState, useCallback, useEffect } from "react";
import { parseDiff } from "./diff-parser";
import { FileDiff } from "./FileDiff";
import { ReviewComment, UIData } from "./types";
import { mockData } from "./mockData";
import { FileTree, buildTree } from "./FileTree";
import { ReviewHeader } from "./ReviewHeader";
import { SummaryPanel } from "./SummaryPanel";

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "unified">(data.viewMode ?? "split");
  const [submitted, setSubmitted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(data.theme ?? "dark");
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({});

  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderPath]: !(prev[folderPath] ?? false) }));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    fetch("/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) }).catch(() => {});
  }, [theme]);

  useEffect(() => {
    fetch("/viewmode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ viewMode }) }).catch(() => {});
  }, [viewMode]);

  useEffect(() => {
    const iv = setInterval(() => { fetch("/ping").catch(() => {}); }, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const handler = () => setSelectedFile(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const decidedCount = Object.values(decisions).filter((d) => d.decision).length;
  const allDone = totalComments > 0 && decidedCount === totalComments;
  const hasAccepted = Object.values(decisions).some((d) => d.decision && d.decision !== "reject");

  function jumpToNextPending() {
    for (let i = 0; i < totalComments; i++) {
      if (!decisions[i]?.decision) {
        const targetFile = result.comments[i]?.file;
        if (targetFile) {
          setOpenFiles((prev) => ({ ...prev, [targetFile]: true }));
        }
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

  const parsed = parseDiff(rawDiff);
  const commentsByFile: Record<string, number> = Object.fromEntries(
    Object.entries(byFile).map(([file, cmts]) => [file, cmts.length])
  );
  const tree = buildTree(parsed.map((f) => f.file), commentsByFile);

  return (
    <>
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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
          {parsed.map((file, i) => (
            <FileDiff
              key={file.file + i}
              file={file}
              comments={byFile[file.file] || []}
              decisions={decisions}
              onDecide={onDecide}
              selected={file.file === selectedFile}
              forceOpen={openFiles[file.file] ?? false}
              viewMode={viewMode}
            />
          ))}
        </div>
        {summaryOpen && (
          <SummaryPanel summary={result.summary} onClose={() => setSummaryOpen(false)} />
        )}
      </div>
    </>
  );
}
