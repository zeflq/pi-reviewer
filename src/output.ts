import { writeFile } from "node:fs/promises";
import path from "node:path";

export type OutputTarget = "terminal" | "comment" | "file";

export interface ReviewComment {
  file: string;
  line: number;
  side: "LEFT" | "RIGHT";
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

export function parseAgentResponse(text: string): ReviewResult {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.comments) &&
      parsed.comments.every(isReviewComment)
    ) {
      return {
        summary: parsed.summary,
        comments: parsed.comments,
      };
    }
  } catch {
    // graceful fallback below
  }

  return { summary: text, comments: [] };
}

function formatReviewResult(result: ReviewResult): string {
  const lines = ["== Review Summary ==", result.summary];

  if (result.comments.length > 0) {
    lines.push("", "== Inline Comments ==");
    for (const comment of result.comments) {
      lines.push(
        `${comment.file}:${comment.line} (${comment.side})`,
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
  const result = parseAgentResponse(options.content);

  if (options.target === "terminal") {
    console.log(formatReviewResult(result));
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
      if (reviewResponse.ok) return;
      console.warn("PR Reviews API failed — falling back to issue comment.");
    }

    // Fallback: Issues Comments API (always works, no inline comments)
    const commentBody = inlineComments.length > 0
      ? `${result.summary}\n\n${formatReviewResult(result)}`
      : result.summary;

    const issueResponse = await fetch(
      `https://api.github.com/repos/${options.repo}/issues/${options.prNumber}/comments`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ body: commentBody }),
      }
    );

    if (!issueResponse.ok) {
      const body = await issueResponse.text().catch(() => "(unreadable)");
      throw new Error(`Failed to post GitHub comment: ${issueResponse.status} ${issueResponse.statusText}\n${body}`);
    }

    return;
  }

  const cwd = options.cwd ?? process.cwd();
  const filePath = path.join(cwd, "pi-review.md");
  await writeFile(filePath, formatReviewResult(result), "utf-8");
  console.log("Review saved to pi-review.md");
}
