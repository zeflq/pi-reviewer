const SEVERITY_RULE = {
    INFO: null,
    WARN: "- Only report CRITICAL and WARN issues — skip INFO",
    CRITICAL: "- Only report CRITICAL issues — skip WARN and INFO",
};
// ── Shared base ───────────────────────────────────────────────────────────────
function buildSharedBase(minSeverity) {
    const severityRule = SEVERITY_RULE[minSeverity];
    return [
        "You are a code reviewer. Review the following PR diff carefully.",
        "",
        "<severity_tiers>",
        "- 🔴 CRITICAL: bugs causing runtime failures, security vulnerabilities, data loss risks",
        "- 🟡 WARN: type errors, missing error handling, logic issues, test gaps",
        "- 🔵 INFO: style, naming, performance hints, suggestions",
        "</severity_tiers>",
        "",
        "<rules>",
        "- Only flag what is actually wrong in the diff — no hypotheticals",
        "- If nothing is wrong, say so clearly",
        ...(severityRule ? [severityRule] : []),
        "</rules>",
    ];
}
// ── System prompts ────────────────────────────────────────────────────────────
/**
 * JSON system prompt — used by local mode and SSH+UI.
 * Agent must return a structured JSON ReviewResult.
 * Conventions and review rules are injected from context when available.
 */
export function buildJSONSystemPrompt(context, minSeverity = "INFO") {
    const base = [
        ...buildSharedBase(minSeverity),
        "- Do not repeat what the project conventions already enforce",
        "",
        "Return only a JSON object matching this schema exactly (no markdown fences, no extra text, no extra fields — do not include the diff or any other field):",
        "<output_format>",
        "{",
        '  "summary": "Overall review in **Markdown**. Use bullet points, `code spans`, and **bold** for clarity.",',
        '  "comments": [',
        '    { "file": "src/auth.ts", "line": 42, "side": "RIGHT", "severity": "CRITICAL", "body": "Inline comment in Markdown." }',
        "  ]",
        "}",
        "</output_format>",
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
    const sections = [base];
    if (conventions.trim())
        sections.push(`<conventions>\n${conventions}\n</conventions>`);
    if (reviewRules.trim())
        sections.push(`<review_rules>\n${reviewRules}\n</review_rules>`);
    return sections.join("\n\n");
}
/**
 * Markdown system prompt — used by SSH-only mode.
 * Agent writes a human-readable markdown review and saves it to pi-review.md.
 */
export function buildMarkdownSystemPrompt(minSeverity = "INFO") {
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
export function buildUserPrompt(diff, skippedFiles) {
    const parts = [`Review this diff:\n<diff>\n${diff}\n</diff>`];
    if (skippedFiles && skippedFiles.length > 0) {
        parts.push(`<skipped_files>\n${skippedFiles.map((f) => `- ${f}`).join("\n")}\n</skipped_files>\nThe above files were not included because the diff exceeded the size limit. Mention them explicitly in your summary as not reviewed.`);
    }
    return parts.join("\n\n");
}
/**
 * SSH mode (both SSH-only and SSH+UI).
 * Agent runs the given diff command, reads project conventions, then reviews.
 */
export function buildSSHUserPrompt(diffCommand) {
    const ts = new Date().toISOString();
    return [
        `<request id="${ts}">`,
        "  <step index=\"1\">",
        "    Run this command to get the current diff. Always re-execute — never reuse output from a previous review.",
        `    <command>${diffCommand}</command>`,
        "  </step>",
        "  <step index=\"2\">",
        "    Read AGENTS.md or CLAUDE.md from the project root if either exists. Scan for markdown links matching [text](./path.md) and read each linked .md file recursively (at any depth). Also read REVIEW.md from the project root if it exists (same recursive rule). These files contain project conventions and review-specific rules.",
        "  </step>",
        "  <step index=\"3\">",
        "    Review the diff according to the system prompt instructions.",
        "  </step>",
        "</request>",
    ].join("\n");
}
