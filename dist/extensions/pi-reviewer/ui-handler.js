import { writeFile } from "node:fs/promises";
import path from "node:path";
import { startUIServer } from "../../src/core/ui-server.js";
export async function handleUIReview(opts) {
    const { result, diff, conventions, source, cwd, notify, sendMessage } = opts;
    const handle = await startUIServer(result, diff);
    notify(`Review UI → ${handle.url}`);
    const action = await handle.waitForAction();
    await handle.close();
    if (action.type === "closed")
        return;
    if (action.type === "save" || action.type === "save-and-send") {
        const md = buildDecisionsMarkdown(result, action.decisions, source);
        await writeFile(path.join(cwd, "pi-review.md"), md, "utf-8");
        notify("Review saved → pi-review.md");
    }
    if (action.type === "send" || action.type === "save-and-send") {
        sendMessage(buildInjectionMessage(result, action.decisions, conventions));
    }
}
function buildDecisionsMarkdown(result, decisions, source) {
    const date = new Date().toISOString().replace("T", " ").slice(0, 19);
    const lines = [`# Pi Review — ${source}`, ``, `> ${date}`, ``, `---`, ``, `## Summary`, ``, result.summary, ``];
    const accepted = decisions.filter((d) => d.decision !== "reject");
    if (accepted.length > 0) {
        lines.push("## Review findings", "");
        for (const d of accepted) {
            const c = result.comments[d.index];
            if (!c)
                continue;
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
            if (c)
                lines.push(`- ❌ \`${c.file}:${c.line}\` ${c.body}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
function buildInjectionMessage(result, decisions, conventions) {
    const accepted = decisions.filter((d) => d.decision !== "reject");
    if (accepted.length === 0)
        return "All review findings were rejected — nothing to address.";
    const parts = ["Here are the review findings to address. Please work through each one:", ""];
    for (const d of accepted) {
        const c = result.comments[d.index];
        if (!c)
            continue;
        parts.push(`**\`${c.file}:${c.line}\`** [${c.severity}]`, c.body);
        if (d.decision === "discuss" && d.discussText)
            parts.push(`My note: ${d.discussText}`);
        parts.push("");
    }
    if (conventions)
        parts.push("---", "Project context:", conventions);
    return parts.join("\n");
}
