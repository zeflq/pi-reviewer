import { writeFile } from "node:fs/promises";
import path from "node:path";

import { type ReviewResult } from "../../src/core/output.js";
import { startUIServer, type CommentDecision } from "../../src/core/ui-server.js";

export interface UIHandlerOptions {
  result: ReviewResult;
  diff: string;
  conventions: string;
  source: string;
  cwd: string;
  notify: (msg: string, type?: "info" | "warning" | "error") => void;
  sendMessage: (msg: string) => void;
  ssh?: boolean;
  /** When set, save is delegated to the remote (SSH) instead of written locally. */
  saveRemote?: (markdown: string) => void;
}

export async function handleUIReview(opts: UIHandlerOptions): Promise<void> {
  const { result, diff, conventions, source, ssh, cwd, notify, sendMessage, saveRemote } = opts;

  const handle = await startUIServer(result, diff, source, ssh);
  notify(`Review UI → ${handle.url}`);

  const action = await handle.waitForAction();
  await handle.close();

  if (action.type === "closed") return;

  if (action.type === "save" || action.type === "save-and-send") {
    const md = buildDecisionsMarkdown(result, action.decisions, source);
    if (saveRemote) {
      saveRemote(md);
      notify("Review save requested → pi-review.md (remote)");
    } else {
      await writeFile(path.join(cwd, "pi-review.md"), md, "utf-8");
      notify("Review saved → pi-review.md");
    }
  }

  if (action.type === "send" || action.type === "save-and-send") {
    sendMessage(buildInjectionMessage(result, action.decisions, conventions));
  }
}

function buildDecisionsMarkdown(result: ReviewResult, decisions: CommentDecision[], source: string): string {
  const date = new Date().toISOString().replace("T", " ").slice(0, 19);
  const lines = [`# Pi Review — ${source}`, ``, `> ${date}`, ``, `---`, ``, `## Summary`, ``, result.summary, ``];

  const accepted = decisions.filter((d) => d.decision !== "reject");
  if (accepted.length > 0) {
    lines.push("## Review findings", "");
    for (const d of accepted) {
      const c = result.comments[d.index];
      if (!c) continue;
      const label = d.decision === "discuss" ? "💬 Discuss" : "✅ Accept";
      lines.push(`**${label}** \`${c.file}:${c.line}\` [${c.severity}]`, c.body, "");
      if (d.decision === "discuss" && d.discussText) {
        lines.push(`> ${d.discussText}`, "");
      }
    }
  }

  const rejected = decisions.filter((d) => d.decision === "reject");
  if (rejected.length > 0) {
    lines.push("## Rejected", "");
    for (const d of rejected) {
      const c = result.comments[d.index];
      if (c) lines.push(`- ❌ \`${c.file}:${c.line}\` ${c.body}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildInjectionMessage(result: ReviewResult, decisions: CommentDecision[], conventions: string): string {
  const accepted = decisions.filter((d) => d.decision !== "reject");

  const parts: string[] = ["Here are the review findings to address. Please work through each one:", ""];

  for (const d of accepted) {
    const c = result.comments[d.index];
    if (!c) continue;
    parts.push(`**\`${c.file}:${c.line}\`** [${c.severity}]`, c.body);
    if (d.decision === "discuss" && d.discussText) parts.push(`My note: ${d.discussText}`);
    parts.push("");
  }

  if (conventions) parts.push("---", "Project context:", conventions);

  return parts.join("\n");
}
