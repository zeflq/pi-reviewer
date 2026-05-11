import { spawn } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAgentResponse, formatForTerminal } from "../../../src/core/output.js";
import { loadContext, mergeContextFiles } from "../../../src/core/context.js";
import { resolveDiff, extractDiffFiles } from "../../../src/core/diff-resolver.js";
import { buildJSONSystemPrompt, buildUserPrompt } from "../../../src/core/prompt-builder.js";
import { readDefaultBranch } from "../../../src/core/ui/server/index.js";
import { createEventAccumulator } from "../events.js";
import { setReviewFooter } from "../footer.js";
import { handleUIReview } from "./ui.js";
import { buildContextGroups } from "./context.js";
export async function runLocalReview(opts) {
    const { systemPrompt, userPrompt, cwd, minSeverity, verbose, model, thinking, stopLoader, notify } = opts;
    const tempPath = path.join(tmpdir(), `pi-reviewer-system-prompt-${randomUUID()}.md`);
    await writeFile(tempPath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
    try {
        const piArgs = [
            "--mode", "json", "-p", "--no-session",
            ...(verbose ? ["--verbose"] : []),
            ...(model ? ["--model", model] : []),
            ...(thinking ? ["--thinking", thinking] : []),
            "--append-system-prompt", tempPath,
            userPrompt,
        ];
        const proc = spawn("pi", piArgs, { cwd, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        let stdoutBuffer = "";
        let rawLines = [];
        const accumulator = createEventAccumulator((line) => { rawLines.push(line); }, {
            onProgress(text) { notify(text); },
        });
        return await new Promise((resolve, reject) => {
            proc.stdout.on("data", (chunk) => {
                stdoutBuffer += chunk.toString();
                const lines = stdoutBuffer.split("\n");
                stdoutBuffer = lines.pop() ?? "";
                for (const line of lines)
                    accumulator.process(line);
            });
            proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
            proc.on("error", (error) => {
                if (error.code === "ENOENT") {
                    reject(new Error('Failed to run "pi": binary not found in PATH.'));
                    return;
                }
                reject(error);
            });
            proc.on("close", (code, signal) => {
                if (stdoutBuffer.trim())
                    accumulator.process(stdoutBuffer);
                stopLoader();
                if (signal) {
                    reject(new Error(`pi process killed by signal ${signal}`));
                    return;
                }
                if (code && code !== 0) {
                    reject(new Error(`pi process exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
                    return;
                }
                const reviewText = accumulator.getLastReviewText();
                const usage = accumulator.getTokenUsage();
                if (!reviewText) {
                    const modelLabel = model ? `"${model}"` : "the current model";
                    if (accumulator.hadAPIError()) {
                        reject(new Error(`${modelLabel} returned an API error. Check your API key or switch models with /review --model anthropic/claude-sonnet-4-6. You can also change the default in the settings panel or delete ~/.pi/pi-reviewer/config.json.`));
                        return;
                    }
                    if (accumulator.hadThinkingOnly()) {
                        reject(new Error(`${modelLabel} produced thinking output but no text response — it may not support structured JSON output. Try /review --model anthropic/claude-sonnet-4-6.`));
                        return;
                    }
                    const parts = [];
                    if (stderr.trim())
                        parts.push(stderr.trim());
                    if (rawLines.length > 0)
                        parts.push(`unexpected output:\n${rawLines.slice(-5).join("\n")}`);
                    reject(new Error(`pi process exited without producing a review.${parts.length ? `\n${parts.join("\n")}` : ""}`));
                    return;
                }
                const result = parseAgentResponse(reviewText, minSeverity);
                resolve(usage ? { ...result, tokenUsage: usage } : result);
            });
        });
    }
    finally {
        await unlink(tempPath).catch(() => undefined);
    }
}
export async function handleLocalReview(opts) {
    const { parsed, ctx, pi, loaderState, minSeverity, verbose, model, thinking, currentModelId, defaultModel, availableModels, defaultThinking, notify } = opts;
    notify("Fetching diff…");
    const { diff, source, warning, skippedFiles } = await resolveDiff({
        cwd: ctx.cwd,
        diff: parsed.diff,
        branch: parsed.branch ?? readDefaultBranch(),
        pr: parsed.pr,
        dir: parsed.dir,
    });
    if (warning)
        notify(warning, "warning");
    notify("Loading context…");
    const context = await loadContext({
        cwd: parsed.dir ? path.resolve(ctx.cwd, parsed.dir) : ctx.cwd,
        gitRoot: parsed.dir ? ctx.cwd : undefined,
    });
    const conventions = mergeContextFiles(context).map(f => f.content).join("\n\n");
    const diffFiles = extractDiffFiles(diff);
    const providerCwd = parsed.dir ? path.resolve(ctx.cwd, parsed.dir) : ctx.cwd;
    const { groups: allContextGroups, contextFiles, contextPaths } = await buildContextGroups(pi.events, providerCwd, context, diffFiles, undefined, parsed.dir ? ctx.cwd : undefined);
    if (contextPaths.length > 0)
        notify(`Context: ${contextPaths.join(", ")}`);
    const systemPrompt = buildJSONSystemPrompt(context, minSeverity, contextFiles);
    const userPrompt = buildUserPrompt(diff, skippedFiles);
    loaderState.stop = setReviewFooter(ctx, source, { model: currentModelId, thinking });
    const result = await runLocalReview({ systemPrompt, userPrompt, cwd: ctx.cwd, minSeverity, verbose, model, thinking, stopLoader: loaderState.stop, notify });
    if (parsed.ui) {
        const injectionMsg = await handleUIReview({
            result, diff, conventions, source, cwd: ctx.cwd, notify,
            currentModel: currentModelId, defaultModel, availableModels,
            defaultThinking, contextGroups: allContextGroups,
        });
        if (injectionMsg)
            pi.sendUserMessage(injectionMsg);
        return;
    }
    const formatted = formatForTerminal(result);
    const date = new Date().toISOString().replace("T", " ").slice(0, 19);
    await writeFile(path.join(ctx.cwd, "pi-review.md"), `# Pi Review — ${source}\n\n> ${date}\n\n---\n\n${formatted}\n`, "utf-8");
    notify("Review saved → pi-review.md");
}
