import type { ContextResult } from "./context.js";

export type MinSeverity = "CRITICAL" | "WARN" | "INFO";

const SEVERITY_RULE: Record<MinSeverity, string | null> = {
  INFO: null,
  WARN: "- Only report CRITICAL and WARN issues — skip INFO",
  CRITICAL: "- Only report CRITICAL issues — skip WARN and INFO",
};

// ── Shared base ───────────────────────────────────────────────────────────────

function buildSharedBase(minSeverity: MinSeverity): string[] {
  const severityRule = SEVERITY_RULE[minSeverity];
  return [
    "You are a code reviewer. Review the following PR diff carefully.",
    "",
    "Severity tiers:",
    "- 🔴 CRITICAL: bugs causing runtime failures, security vulnerabilities, data loss risks",
    "- 🟡 WARN: type errors, missing error handling, logic issues, test gaps",
    "- 🔵 INFO: style, naming, performance hints, suggestions",
    "",
    "Rules:",
    "- Only flag what is actually wrong in the diff — no hypotheticals",
    "- If nothing is wrong, say so clearly",
    ...(severityRule ? [severityRule] : []),
  ];
}

// ── System prompts ────────────────────────────────────────────────────────────

/**
 * JSON system prompt — used by local mode and SSH+UI.
 * Agent must return a structured JSON ReviewResult.
 * Conventions and review rules are injected from context when available.
 */
export function buildJSONSystemPrompt(
  context: ContextResult | string,
  minSeverity: MinSeverity = "INFO",
): string {
  const base = [
    ...buildSharedBase(minSeverity),
    "- Do not repeat what the project conventions already enforce",
    "",
    "Return only a JSON object with this exact shape (no markdown fences, no extra text):",
    "{",
    '  "summary": "Overall review in **Markdown**. Use bullet points, `code spans`, and **bold** for clarity.",',
    '  "comments": [',
    '    { "file": "src/auth.ts", "line": 42, "side": "RIGHT", "severity": "CRITICAL", "body": "Inline comment in Markdown." }',
    "  ]",
    "}",
    "",
    "Field rules:",
    "- summary: overall review written in Markdown",
    "- comments: inline comments attached to specific diff lines (may be empty [])",
    "- file: relative path from repo root",
    "- line: line number in the file (not the diff position)",
    '- side: "RIGHT" for added/context lines, "LEFT" for removed lines',
    '- severity: "CRITICAL" | "WARN" | "INFO"',
    "- body: inline comment text, may use Markdown",
  ].join("\n");

  const conventions = typeof context === "string" ? context : context.conventions;
  const reviewRules = typeof context === "string" ? "" : context.reviewRules;

  const sections: string[] = [base];
  if (conventions.trim()) sections.push(`--- Project conventions (AGENTS.md / CLAUDE.md) ---\n${conventions}\n---`);
  if (reviewRules.trim()) sections.push(`--- Review-specific rules (REVIEW.md) ---\n${reviewRules}\n---`);

  return sections.join("\n\n");
}

/**
 * Markdown system prompt — used by SSH-only mode.
 * Agent writes a human-readable markdown review and saves it to pi-review.md.
 */
export function buildMarkdownSystemPrompt(minSeverity: MinSeverity = "INFO"): string {
  return [
    ...buildSharedBase(minSeverity),
    "",
    "Write your review as Markdown with:",
    "- A summary section with bullet points for each issue",
    "- An inline comments section listing file, line, and comment for each specific finding",
    "",
    "After writing your review, save it to pi-review.md in the project root using the Write tool.",
  ].join("\n");
}

// ── User prompts ──────────────────────────────────────────────────────────────

/** Local mode — diff only, conventions already in system prompt. */
export function buildUserPrompt(diff: string, skippedFiles?: string[]): string {
  let prompt = `Review this diff:\n\n${diff}`;
  if (skippedFiles && skippedFiles.length > 0) {
    prompt += `\n\n⚠ The following files were not included because the diff exceeded the size limit. Mention them explicitly in your summary as not reviewed:\n${skippedFiles.map((f) => `- ${f}`).join("\n")}`;
  }
  return prompt;
}

/**
 * SSH mode (both SSH-only and SSH+UI).
 * Agent runs the given diff command, reads project conventions, then reviews.
 */
export function buildSSHUserPrompt(diffCommand: string): string {
  return [
    "You are performing a code review. Execute all steps in order:",
    "",
    `1. Run this command to get the diff: ${diffCommand}`,
    "2. Read AGENTS.md or CLAUDE.md from the project root if either exists. Scan for markdown links matching [text](./path.md) and read each linked .md file recursively (at any depth). Also read REVIEW.md from the project root if it exists (same recursive rule). These files contain project conventions and review-specific rules.",
    "3. Review the diff according to the system prompt instructions.",
  ].join("\n");
}
