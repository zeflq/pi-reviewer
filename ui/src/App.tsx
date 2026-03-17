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

interface TreeNode {
  name: string;
  fullPath?: string;
  isDir: boolean;
  children: TreeNode[];
  commentCount: number;
}

function buildTree(files: string[], commentsByFile: Record<string, number>): TreeNode[] {
  const root: TreeNode[] = [];

  function insert(nodes: TreeNode[], segments: string[], fullPath: string): void {
    const [head, ...rest] = segments;
    if (rest.length === 0) {
      // file node
      nodes.push({
        name: head,
        fullPath,
        isDir: false,
        children: [],
        commentCount: commentsByFile[fullPath] ?? 0,
      });
      return;
    }
    // folder node
    let dir = nodes.find((n) => n.isDir && n.name === head);
    if (!dir) {
      dir = { name: head, isDir: true, children: [], commentCount: 0 };
      nodes.push(dir);
    }
    insert(dir.children, rest, fullPath);
  }

  for (const file of files) {
    insert(root, file.split("/"), file);
  }

  function sumCounts(node: TreeNode): number {
    if (!node.isDir) return node.commentCount;
    node.commentCount = node.children.reduce((acc, c) => acc + sumCounts(c), 0);
    return node.commentCount;
  }

  root.forEach(sumCounts);
  return root;
}

const FolderIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#54aeff", flexShrink: 0 }}>
    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
  </svg>
);

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

function TreeNodes({
  nodes,
  depth,
  collapsedFolders,
  toggleFolder,
  folderPrefix,
}: {
  nodes: TreeNode[];
  depth: number;
  collapsedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  folderPrefix: string;
}) {
  return (
    <>
      {nodes.map((node) => {
        const folderPath = folderPrefix ? `${folderPrefix}/${node.name}` : node.name;
        const collapsed = collapsedFolders[folderPath] ?? false;

        if (node.isDir) {
          return (
            <div key={folderPath}>
              <div
                className="tree-folder"
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => toggleFolder(folderPath)}
              >
                <span className="tree-chevron">{collapsed ? "▶" : "▼"}</span>
                <FolderIcon />
                <span className="tree-name">{node.name}</span>
                {node.commentCount > 0 && <span className="cbadge">{node.commentCount}</span>}
              </div>
              {!collapsed && (
                <TreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  collapsedFolders={collapsedFolders}
                  toggleFolder={toggleFolder}
                  folderPrefix={folderPath}
                />
              )}
            </div>
          );
        }

        return (
          <a
            key={node.fullPath}
            className="tree-file"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            href={`#file-${CSS.escape(node.fullPath!)}`}
          >
            <FileIcon />
            <span className="tree-name">{node.name}</span>
            {node.commentCount > 0 && <span className="cbadge">{node.commentCount}</span>}
          </a>
        );
      })}
    </>
  );
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(data.theme ?? "dark");
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderPath]: !(prev[folderPath] ?? false) }));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    fetch("/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) }).catch(() => {});
  }, [theme]);

  const decidedCount = Object.values(decisions).filter((d) => d.decision).length;
  const allDone = totalComments > 0 && decidedCount === totalComments;
  const hasAccepted = Object.values(decisions).some((d) => d.decision && d.decision !== "reject");

  function jumpToNextPending() {
    for (let i = 0; i < totalComments; i++) {
      if (!decisions[i]?.decision) {
        document.getElementById(`cmt-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }

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

  const commentsByFile: Record<string, number> = {};
  for (const [file, cmts] of Object.entries(byFile)) {
    commentsByFile[file] = cmts.length;
  }
  const fileList = parsed.map((f) => f.file);
  const tree = buildTree(fileList, commentsByFile);

  return (
    <>
      <div id="sticky-top">

        {/* ── Row 1: branding + theme ── */}
        <div id="hdr">
          <h1 id="wordmark"><span id="wordmark-pi">π</span> review</h1>
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
          <button className="icon-btn" onClick={() => setSidebarOpen((o) => !o)} title={sidebarOpen ? "Hide file sidebar" : "Show file sidebar"}>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
          <button className="icon-btn" onClick={() => setSummaryOpen((o) => !o)} title="Summary">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <span id="hdr2-sep" />
          <span id="hdr2-source">{source ? (ssh ? `SSH · ${source}` : source) : ""}</span>
          <span id="progress">{decidedCount} / {totalComments} decided</span>
          <button className="icon-btn" disabled={allDone} onClick={jumpToNextPending} title="Jump to next undecided comment">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
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

      </div>
      <div id="layout">
        {sidebarOpen && (
          <div id="file-sidebar">
            <TreeNodes
              nodes={tree}
              depth={0}
              collapsedFolders={collapsedFolders}
              toggleFolder={toggleFolder}
              folderPrefix=""
            />
          </div>
        )}
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
      </div>
    </>
  );
}
