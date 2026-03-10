import { writeFile } from "node:fs/promises";
import path from "node:path";

export type OutputTarget = "terminal" | "comment" | "file";
export type Severity = "CRITICAL" | "WARN" | "INFO";

const SEVERITY_RANK: Record<Severity, number> = { INFO: 0, WARN: 1, CRITICAL: 2 };

export interface ReviewComment {
  file: string;
  line: number;
  side: "LEFT" | "RIGHT";
  severity: Severity;
  body: string;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
}

export interface OutputOptions {
  target: OutputTarget;
  content: string;
  cwd?: string;
  githubToken?: string;
  prNumber?: number;
  repo?: string;
  commitId?: string;
  minSeverity?: Severity;
}

function normalizeSeverity(value: unknown): Severity {
  if (value === "CRITICAL" || value === "WARN" || value === "INFO") return value;
  return "INFO";
}

function isReviewComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object") return false;
  const comment = value as Record<string, unknown>;
  return (
    typeof comment.file === "string" &&
    typeof comment.line === "number" &&
    Number.isFinite(comment.line) &&
    (comment.side === "LEFT" || comment.side === "RIGHT") &&
    typeof comment.body === "string"
  );
}

function tryParseJSON(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // not valid JSON
  }
  return null;
}

export function parseAgentResponse(text: string, minSeverity: Severity = "INFO"): ReviewResult {
  const candidates: string[] = [];

  // 1. raw text
  candidates.push(text.trim());

  // 2. content inside any ```json ... ``` or ``` ... ``` fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  // 3. first { to last } in the whole text
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    const parsed = tryParseJSON(candidate);
    if (
      parsed &&
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.comments) &&
      parsed.comments.every(isReviewComment)
    ) {
      const minRank = SEVERITY_RANK[minSeverity];
      return {
        summary: parsed.summary,
        comments: parsed.comments
          .map((c) => ({ ...c, severity: normalizeSeverity(c.severity) }))
          .filter((c) => SEVERITY_RANK[c.severity] >= minRank),
      };
    }
  }

  return { summary: text, comments: [] };
}

const ATTRIBUTION = "*Review by [pi-reviewer](https://github.com/zeflq/pi-reviewer)*";

const SEVERITY_EMOJI: Record<Severity, string> = { CRITICAL: "🔴", WARN: "🟡", INFO: "🔵" };

function formatForGitHub(result: ReviewResult): string {
  const lines = ["## Pi Reviewer", "", result.summary];

  if (result.comments.length > 0) {
    lines.push("", "### Inline Comments");
    for (const comment of result.comments) {
      lines.push(
        "",
        `${SEVERITY_EMOJI[comment.severity]} **\`${comment.file}:${comment.line}\`** · ${comment.side}`,
        comment.body
      );
    }
  }

  lines.push("", "---", ATTRIBUTION);
  return lines.join("\n");
}

export function formatForTerminal(result: ReviewResult): string {
  const lines = ["== Review Summary ==", result.summary];

  if (result.comments.length > 0) {
    lines.push("", "== Inline Comments ==");
    for (const comment of result.comments) {
      lines.push(
        `${SEVERITY_EMOJI[comment.severity]} ${comment.file}:${comment.line} (${comment.side})`,
        comment.body,
        ""
      );
    }

    while (lines[lines.length - 1] === "") {
      lines.pop();
    }
  }

  return lines.join("\n");
}

export async function sendOutput(options: OutputOptions): Promise<void> {
  const result = parseAgentResponse(options.content, options.minSeverity);

  if (options.target === "terminal") {
    console.log(formatForTerminal(result));
    return;
  }

  if (options.target === "comment") {
    if (!options.githubToken) {
      throw new Error("GITHUB_TOKEN is required to post a comment");
    }

    if (typeof options.prNumber !== "number") {
      throw new Error("PR number is required to post a comment");
    }

    if (!options.repo) {
      throw new Error("Repository (owner/repo) is required to post a comment");
    }

    const headers = {
      Authorization: `Bearer ${options.githubToken}`,
      "Content-Type": "application/json",
    };

    const inlineComments = result.comments.map((comment) => ({
      path: comment.file,
      line: comment.line,
      side: comment.side,
      body: comment.body,
    }));

    // Try PR Reviews API first (supports inline comments)
    if (inlineComments.length > 0 && options.commitId) {
      console.log(`[pi-reviewer] posting review with ${inlineComments.length} inline comment(s)`);
      const reviewResponse = await fetch(
        `https://api.github.com/repos/${options.repo}/pulls/${options.prNumber}/reviews`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            commit_id: options.commitId,
            body: result.summary,
            event: "COMMENT",
            comments: inlineComments,
          }),
        }
      );
      if (reviewResponse.ok) {
        console.log("[pi-reviewer] review posted with inline comments");
        return;
      }
      const errBody = await reviewResponse.text().catch(() => "");
      console.warn(`[pi-reviewer] inline comments rejected (${reviewResponse.status}) — posting summary only. Reason: ${errBody}`);
    }

    // Fallback: Issues Comments API (always works, no inline comments)
    const issueResponse = await fetch(
      `https://api.github.com/repos/${options.repo}/issues/${options.prNumber}/comments`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ body: formatForGitHub(result) }),
      }
    );

    if (!issueResponse.ok) {
      const body = await issueResponse.text().catch(() => "(unreadable)");
      throw new Error(`Failed to post GitHub comment: ${issueResponse.status} ${issueResponse.statusText}\n${body}`);
    }

    console.log("[pi-reviewer] review comment posted");
    return;
  }

  const cwd = options.cwd ?? process.cwd();
  const filePath = path.join(cwd, "pi-review.md");
  await writeFile(filePath, formatForTerminal(result), "utf-8");
  console.log(`[pi-reviewer] review saved to ${filePath}`);
}
