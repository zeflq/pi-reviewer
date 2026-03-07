export function buildSystemPrompt(context: string): string {
  const basePrompt = [
    "You are a code reviewer. Review the following PR diff carefully.",
    "",
    "Severity tiers:",
    "- CRITICAL: bugs causing runtime failures, security vulnerabilities, data loss risks",
    "- WARN: type errors, missing error handling, logic issues, test gaps",
    "- INFO: style, naming, performance hints, suggestions",
    "",
    "Rules:",
    "- Only flag what is actually wrong in the diff — no hypotheticals",
    "- Do not repeat what the project conventions already enforce",
    "- If nothing is wrong, say so clearly",
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
    "- summary: overall review written in Markdown — use bullet points for issues, `code spans` for identifiers, **bold** for severity",
    "- comments: inline comments attached to specific diff lines (may be empty [])",
    "- file: relative path from repo root",
    "- line: line number in the file (not the diff position)",
    '- side: "RIGHT" for added/context lines, "LEFT" for removed lines',
    '- severity: "CRITICAL" | "WARN" | "INFO"',
    "- body: inline comment text, may use Markdown",
  ].join("\n");

  if (!context.trim()) {
    return basePrompt;
  }

  return `${basePrompt}\n\n--- Project conventions (AGENTS.md / CLAUDE.md) ---\n${context}\n---`;
}

export function buildUserPrompt(diff: string): string {
  return `Review this diff:\n\n${diff}`;
}
