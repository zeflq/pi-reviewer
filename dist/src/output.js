import { writeFile } from "node:fs/promises";
import path from "node:path";
function isReviewComment(value) {
    if (!value || typeof value !== "object")
        return false;
    const comment = value;
    return (typeof comment.file === "string" &&
        typeof comment.line === "number" &&
        Number.isFinite(comment.line) &&
        (comment.side === "LEFT" || comment.side === "RIGHT") &&
        typeof comment.body === "string");
}
export function parseAgentResponse(text) {
    try {
        const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(stripped);
        if (parsed &&
            typeof parsed === "object" &&
            typeof parsed.summary === "string" &&
            Array.isArray(parsed.comments) &&
            parsed.comments.every(isReviewComment)) {
            return {
                summary: parsed.summary,
                comments: parsed.comments,
            };
        }
    }
    catch {
        // graceful fallback below
    }
    return { summary: text, comments: [] };
}
const ATTRIBUTION = "*Review by [pi-reviewer](https://github.com/zeflq/pi-reviewer)*";
function formatForGitHub(result) {
    const lines = ["## Pi Reviewer", "", result.summary];
    if (result.comments.length > 0) {
        lines.push("", "### Inline Comments");
        for (const comment of result.comments) {
            lines.push("", `**\`${comment.file}:${comment.line}\`** · ${comment.side}`, comment.body);
        }
    }
    lines.push("", "---", ATTRIBUTION);
    return lines.join("\n");
}
function formatForTerminal(result) {
    const lines = ["== Review Summary ==", result.summary];
    if (result.comments.length > 0) {
        lines.push("", "== Inline Comments ==");
        for (const comment of result.comments) {
            lines.push(`${comment.file}:${comment.line} (${comment.side})`, comment.body, "");
        }
        while (lines[lines.length - 1] === "") {
            lines.pop();
        }
    }
    return lines.join("\n");
}
export async function sendOutput(options) {
    const result = parseAgentResponse(options.content);
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
            const reviewResponse = await fetch(`https://api.github.com/repos/${options.repo}/pulls/${options.prNumber}/reviews`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    commit_id: options.commitId,
                    body: result.summary,
                    event: "COMMENT",
                    comments: inlineComments,
                }),
            });
            if (reviewResponse.ok) {
                console.log("[pi-reviewer] review posted with inline comments");
                return;
            }
            const errBody = await reviewResponse.text().catch(() => "");
            console.warn(`[pi-reviewer] inline comments rejected (${reviewResponse.status}) — posting summary only. Reason: ${errBody}`);
        }
        // Fallback: Issues Comments API (always works, no inline comments)
        const issueResponse = await fetch(`https://api.github.com/repos/${options.repo}/issues/${options.prNumber}/comments`, {
            method: "POST",
            headers,
            body: JSON.stringify({ body: formatForGitHub(result) }),
        });
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
