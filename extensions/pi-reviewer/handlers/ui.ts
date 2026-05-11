import { writeFile } from "node:fs/promises";
import path from "node:path";

import { type ReviewResult } from "../../../src/core/output.js";
import { startUIServer, type CommentDecision, type ModelInfo, type ContextGroup } from "../../../src/core/ui-server.js";

export interface UIHandlerOptions {
  result: ReviewResult;
  diff: string;
  source: string;
  cwd: string;
  notify: (msg: string, type?: "info" | "warning" | "error") => void;
  ssh?: boolean;
  currentModel?: string;
  currentThinking?: string;
  defaultModel?: string;
  availableModels?: ModelInfo[];
  defaultThinking?: string;
  contextGroups?: ContextGroup[];
  /** When set, save is delegated to the remote (SSH) instead of written locally. */
  saveRemote?: (markdown: string) => void;
}

/**
 * Returns the injection message to send to the agent, or undefined if none.
 * Save is handled internally; the caller is responsible for sending the injection
 * message at the right time (after any agent-side save has completed).
 */
export async function handleUIReview(opts: UIHandlerOptions): Promise<string | undefined> {
  const { result, diff, source, ssh, cwd, notify, saveRemote, currentModel, currentThinking, defaultModel, availableModels, defaultThinking, contextGroups } = opts;

  const handle = await startUIServer(result, diff, source, ssh, { currentModel, currentThinking, defaultModel, availableModels, defaultThinking }, contextGroups);
  notify(`Review UI → ${handle.url}`);

  const action = await handle.waitForAction();
  await handle.close();

  if (action.type === "closed") return undefined;

  if (action.type === "save" || action.type === "save-and-send") {
    const md = buildDecisionsMarkdown(result, action.decisions, source, action.globalComment);
    if (saveRemote) {
      saveRemote(md);
      notify("Review save requested → pi-review.md (remote)");
    } else {
      await writeFile(path.join(cwd, "pi-review.md"), md, "utf-8");
      notify("Review saved → pi-review.md");
    }
  }

  if (action.type === "send" || action.type === "save-and-send") {
    const selectedConventions = buildConventions(contextGroups ?? [], action.selectedGroups);
    return buildInjectionMessage(result, action.decisions, selectedConventions, action.globalComment);
  }

  return undefined;
}

function buildConventions(contextGroups: ContextGroup[], selectedGroups?: string[]): string {
  const groups = selectedGroups
    ? contextGroups.filter((g) => selectedGroups.includes(g.name))
    : contextGroups;
  return groups.flatMap((g) => g.files.map((f) => f.content)).join("\n\n");
}

function buildDecisionsMarkdown(result: ReviewResult, decisions: CommentDecision[], source: string, globalComment?: string): string {
  const date = new Date().toISOString().replace("T", " ").slice(0, 19);
  const lines = [`# Pi Review — ${source}`, ``, `> ${date}`, ``, `---`, ``, `## Summary`, ``, result.summary, ``];
  if (globalComment) lines.push("## Comment", "", globalComment, "");

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

function buildInjectionMessage(result: ReviewResult, decisions: CommentDecision[], conventions: string, globalComment?: string): string {
  const accepted = decisions.filter((d) => d.decision !== "reject");

  const parts: string[] = ["Here are the review findings to address. Please work through each one:", ""];
  if (globalComment) parts.push(`**Overall comment:** ${globalComment}`, "");

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
