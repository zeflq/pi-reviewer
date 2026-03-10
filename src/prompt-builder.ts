export type MinSeverity = "CRITICAL" | "WARN" | "INFO";

const SEVERITY_RULE: Record<MinSeverity, string | null> = {
  INFO: null,
  WARN: "- Only report CRITICAL and WARN issues — skip INFO",
  CRITICAL: "- Only report CRITICAL issues — skip WARN and INFO",
};

export function buildSystemPrompt(context: string, minSeverity: MinSeverity = "INFO"): string {
  const severityRule = SEVERITY_RULE[minSeverity];
  const basePrompt = [
    "You are a code reviewer. Review the following PR diff carefully.",
    "",
    "Severity tiers:",
    "- 🔴 CRITICAL: bugs causing runtime failures, security vulnerabilities, data loss risks",
    "- 🟡 WARN: type errors, missing error handling, logic issues, test gaps",
    "- 🔵 INFO: style, naming, performance hints, suggestions",
    "",
    "Rules:",
    "- Only flag what is actually wrong in the diff — no hypotheticals",
    "- Do not repeat what the project conventions already enforce",
    "- If nothing is wrong, say so clearly",
    ...(severityRule ? [severityRule] : []),
    "",
    "Return only a JSON object with this exact shape (no markdown fences, no extra text):",
    "{",
    '  "summary": "Overall review in **Markdown**. Use bullet points prefixed with the severity emoji (🔴/🟡/🔵), `code spans`, and **bold** for clarity.",',
    '  "comments": [',
    '    { "file": "src/auth.ts", "line": 42, "side": "RIGHT", "severity": "CRITICAL", "body": "🔴 Inline comment in Markdown." }',
    "  ]",
    "}",
    "",
    "Field rules:",
    "- summary: overall review written in Markdown — prefix each bullet with the severity emoji (🔴 CRITICAL, 🟡 WARN, 🔵 INFO)",
    "- comments: inline comments attached to specific diff lines (may be empty [])",
    "- file: relative path from repo root",
    "- line: line number in the file (not the diff position)",
    '- side: "RIGHT" for added/context lines, "LEFT" for removed lines',
    '- severity: "CRITICAL" | "WARN" | "INFO"',
    "- body: inline comment text — prefix with the severity emoji (e.g. 🔴, 🟡, 🔵), may use Markdown",
  ].join("\n");

  if (!context.trim()) {
    return basePrompt;
  }

  return `${basePrompt}\n\n--- Project conventions (AGENTS.md / CLAUDE.md) ---\n${context}\n---`;
}

export function buildUserPrompt(diff: string, skippedFiles?: string[]): string {
  let prompt = `Review this diff:\n\n${diff}`;
  if (skippedFiles && skippedFiles.length > 0) {
    prompt += `\n\n⚠ The following files were not included because the diff exceeded the size limit. Mention them explicitly in your summary as not reviewed:\n${skippedFiles.map((f) => `- ${f}`).join("\n")}`;
  }
  return prompt;
}

export function buildSSHSystemPrompt(minSeverity: MinSeverity = "INFO"): string {
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
    "",
    "Write your review as Markdown with:",
    "- A summary section with bullet points for each issue (prefix with the severity emoji: 🔴 CRITICAL, 🟡 WARN, 🔵 INFO)",
    "- An inline comments section listing file, line, and comment for each specific finding",
    "",
    "After writing your review, save it to pi-review.md in the project root using the Write tool.",
  ].join("\n");
}

export interface SSHPromptOptions {
  branch?: string;
  diff?: string;
  pr?: number;
}

export function buildSSHUserPrompt(options: SSHPromptOptions = {}): string {
  let diffCommand: string;

  if (typeof options.pr === "number") {
    diffCommand = `gh pr diff ${options.pr}`;
  } else if (options.diff) {
    diffCommand = `git diff ${options.diff}`;
  } else if (options.branch) {
    diffCommand = `git diff $(git merge-base ${options.branch} HEAD)`;
  } else {
    diffCommand = `git diff $(git merge-base $(git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null || echo origin/main) HEAD)`;
  }

  return [
    "You are performing a code review. Execute all steps in order:",
    "",
    `1. Run this command to get the diff: ${diffCommand}`,
    "2. Read AGENTS.md or CLAUDE.md from the project root if either exists.",
    "3. Review the diff. Write your findings as markdown with:",
    "   - A summary section with bullet points prefixed by CRITICAL / WARN / INFO",
    "   - An inline comments section listing file, line, and comment for each finding",
    "4. Run `git rev-parse --show-toplevel` to get the absolute project root path.",
    "   Use the Write tool to save your markdown review to <project_root>/pi-review.md.",
    "   The file must contain readable markdown — not JSON, not code-fenced JSON.",
  ].join("\n");
}
