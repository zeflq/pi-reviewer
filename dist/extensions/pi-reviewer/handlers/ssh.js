import path from "node:path";
import { parseAgentResponse, extractLastAssistantText } from "../../../src/core/output.js";
import { loadContextSSH, mergeContextFiles } from "../../../src/core/context.js";
import { extractDiffFiles } from "../../../src/core/diff-resolver.js";
import { filterDiff } from "../../../src/core/diff-filter.js";
import { buildJSONSystemPrompt, buildMarkdownSystemPrompt, buildUserPrompt } from "../../../src/core/prompt-builder.js";
import { readSshFlag, resolveSshState, localFs, sshFs as makeSshFs, sshExec } from "../../../src/core/ssh.js";
import { readDefaultBranch } from "../../../src/core/ui/server/index.js";
import { setReviewFooter } from "../footer.js";
import { handleUIReview } from "./ui.js";
import { buildContextGroups } from "./context.js";
import { buildSSHDiffCommand, buildSSHOriginBaseCommand } from "../args.js";
export function buildSSHSource(parsed, opts = {}) {
    if (typeof parsed.pr === "number")
        return `PR #${parsed.pr}`;
    if (parsed.diff)
        return `git diff ${parsed.diff}`;
    const head = opts.head ?? "HEAD";
    const base = parsed.branch ?? opts.branch ?? opts.detectedBase ?? "origin/HEAD";
    return `${head} vs ${base}`;
}
export function runSSHReview(opts) {
    const { systemPrompt, userPrompt, pi, stopLoader, notify } = opts;
    let done = false;
    pi.on("before_agent_start", async () => {
        if (done)
            return {};
        return { systemPrompt };
    });
    pi.on("agent_end", async () => {
        if (done)
            return;
        done = true;
        stopLoader();
        notify("Review saved → pi-review.md");
    });
    pi.sendUserMessage(userPrompt);
}
export function runSSHReviewAndWait(opts) {
    const { systemPrompt, userPrompt, diff, pi, minSeverity, stopLoader, notify } = opts;
    let done = false;
    return new Promise((resolve, reject) => {
        pi.on("before_agent_start", async () => {
            if (done)
                return {};
            return { systemPrompt };
        });
        pi.on("agent_end", async (event) => {
            if (done)
                return;
            done = true;
            stopLoader();
            const text = extractLastAssistantText(event.messages);
            if (!text) {
                reject(new Error("SSH agent returned an empty response"));
                return;
            }
            try {
                const result = parseAgentResponse(text, minSeverity);
                let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalTokens = 0, totalCost = 0;
                for (const msg of event.messages) {
                    const am = msg;
                    if (am.role === "assistant" && am.usage) {
                        totalInput += am.usage.input;
                        totalOutput += am.usage.output;
                        totalCacheRead += am.usage.cacheRead;
                        totalCacheWrite += am.usage.cacheWrite;
                        totalTokens += am.usage.totalTokens;
                        totalCost += am.usage.cost.total;
                    }
                }
                const tokenUsage = totalTokens > 0 ? { inputTokens: totalInput, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, cacheWriteTokens: totalCacheWrite, totalTokens, cost: totalCost } : undefined;
                resolve({ ...result, diff, ...(tokenUsage ? { tokenUsage } : {}) });
            }
            catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
        pi.sendUserMessage(userPrompt);
    });
}
export async function handleSSHReview(opts) {
    const { parsed, ctx, pi, loaderState, minSeverity, currentModelId, thinking, defaultModel, availableModels, defaultThinking, notify } = opts;
    notify("Fetching SSH diff and context…");
    const sshFlag = readSshFlag();
    const sshState = sshFlag ? await resolveSshState(sshFlag).catch(() => null) : null;
    const sshRemoteCwd = sshState
        ? (parsed.dir ? path.posix.join(sshState.remoteCwd, parsed.dir) : sshState.remoteCwd)
        : ctx.cwd;
    const providerFs = sshState ? makeSshFs(sshState.remote) : localFs();
    const gitCmd = `git -C ${JSON.stringify(sshRemoteCwd)}`;
    const [sshContext, rawSshDiff, sshHeadBranch, sshOriginBase] = await Promise.all([
        sshState
            ? loadContextSSH(sshState.remote, sshRemoteCwd, parsed.dir ? sshState.remoteCwd : undefined)
                .catch(() => ({ conventions: [], reviewRules: [] }))
            : Promise.resolve({ conventions: [], reviewRules: [] }),
        sshState
            ? sshExec(sshState.remote, buildSSHDiffCommand(parsed, { remoteCwd: sshRemoteCwd, branch: readDefaultBranch() })).catch(() => "")
            : Promise.resolve(""),
        sshState
            ? sshExec(sshState.remote, `${gitCmd} rev-parse --abbrev-ref HEAD`).catch(() => "HEAD")
            : Promise.resolve("HEAD"),
        sshState
            ? sshExec(sshState.remote, buildSSHOriginBaseCommand(gitCmd)).catch(() => "origin/main")
            : Promise.resolve("origin/main"),
    ]);
    const source = buildSSHSource(parsed, {
        branch: readDefaultBranch(),
        head: sshHeadBranch.trim() || "HEAD",
        detectedBase: sshOriginBase.trim() || undefined,
    });
    const { diff: sshDiff, warning: sshDiffWarning, skippedFiles: sshSkippedFiles } = filterDiff(rawSshDiff);
    if (sshDiffWarning)
        notify(sshDiffWarning, "warning");
    const sshDiffFiles = extractDiffFiles(rawSshDiff);
    const sshGitRoot = parsed.dir ? (sshState ? sshState.remoteCwd : ctx.cwd) : undefined;
    const { groups: sshAllContextGroups, contextFiles: sshContextFiles, contextPaths: allSshContextPaths } = await buildContextGroups(pi.events, sshRemoteCwd, sshContext, sshDiffFiles, providerFs, sshGitRoot);
    if (allSshContextPaths.length > 0)
        notify(`Context: ${allSshContextPaths.join(", ")}`);
    const userPrompt = buildUserPrompt(sshDiff, sshSkippedFiles);
    if (!parsed.ui) {
        const systemPrompt = buildMarkdownSystemPrompt(minSeverity, sshContext, sshContextFiles);
        loaderState.stop = setReviewFooter(ctx, source, { model: currentModelId, thinking });
        runSSHReview({ systemPrompt, userPrompt, pi, stopLoader: loaderState.stop, notify });
        return;
    }
    const systemPrompt = buildJSONSystemPrompt(sshContext, minSeverity, sshContextFiles);
    loaderState.stop = setReviewFooter(ctx, source, { model: currentModelId, thinking });
    const result = await runSSHReviewAndWait({ systemPrompt, userPrompt, diff: sshDiff, pi, minSeverity, stopLoader: loaderState.stop, notify });
    const conventions = mergeContextFiles(sshContext).map(f => f.content).join("\n\n");
    let sshSaveTriggered = false;
    const injectionMsg = await handleUIReview({
        result, diff: sshDiff, conventions, source, ssh: true, cwd: ctx.cwd, notify,
        currentModel: currentModelId, currentThinking: thinking, defaultModel, availableModels,
        defaultThinking, contextGroups: sshAllContextGroups,
        saveRemote: (md) => {
            sshSaveTriggered = true;
            pi.sendUserMessage(`Run \`git rev-parse --show-toplevel\` to get the project root path, then write the following content to that path + "/pi-review.md" (e.g. if the root is /some/path, write to /some/path/pi-review.md):\n\n${md}`);
        },
    });
    if (injectionMsg) {
        if (sshSaveTriggered) {
            // ExtensionAPI has no .once(); guard with `sent` flag to fire only once
            let sent = false;
            pi.on("agent_end", async () => {
                if (sent)
                    return;
                sent = true;
                pi.sendUserMessage(injectionMsg);
            });
        }
        else {
            pi.sendUserMessage(injectionMsg);
        }
    }
}
