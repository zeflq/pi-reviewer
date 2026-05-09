import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadContext, collectProviderContext, mergeContextFiles } from "../../src/core/context.js";
import { resolveDiff, extractDiffFiles } from "../../src/core/diff-resolver.js";
import { filterDiff } from "../../src/core/diff-filter.js";
import { formatForTerminal } from "../../src/core/output.js";
import { buildJSONSystemPrompt, buildMarkdownSystemPrompt, buildSSHUserPrompt, buildUserPrompt } from "../../src/core/prompt-builder.js";
import { readVerbose, readMinSeverity, readModel, readThinking, readDefaultBranch } from "../../src/core/ui/server/index.js";
import { loadContextSSH } from "../../src/core/context.js";
import { readSshFlag, resolveSshState, localFs, sshFs as makeSshFs, sshExec } from "../../src/core/ssh.js";
import { parseArgs, buildSSHDiffCommand, buildSSHOriginBaseCommand } from "./args.js";
import { resolveCurrentModelId } from "./model.js";
import { setReviewFooter } from "./footer.js";
import { runLocalReview } from "./run-local.js";
import { runSSHReview, runSSHReviewAndWait } from "./run-ssh.js";
import { handleUIReview } from "./ui-handler.js";
export function buildSSHSource(parsed, opts = {}) {
    if (typeof parsed.pr === "number")
        return `PR #${parsed.pr}`;
    if (parsed.diff)
        return `git diff ${parsed.diff}`;
    const head = opts.head ?? "HEAD";
    const base = parsed.branch ?? opts.branch ?? opts.detectedBase ?? "origin/HEAD";
    return `${head} vs ${base}`;
}
export default function (pi) {
    pi.registerCommand("review", {
        description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --ssh, --ui, --dry-run)",
        async handler(args, ctx) {
            const notify = ctx.ui.notify.bind(ctx.ui);
            let stopLoader = () => { };
            let sshMode = false;
            try {
                const parsed = parseArgs(args);
                sshMode = parsed.ssh ?? false;
                const minSeverity = parsed.minSeverity ?? readMinSeverity();
                const verbose = parsed.verbose ?? readVerbose();
                const model = parsed.model ?? readModel();
                const thinking = parsed.thinking ?? readThinking();
                const availableModels = ctx.modelRegistry.getAvailable().map((m) => ({
                    id: m.id,
                    name: m.name,
                    provider: m.provider,
                }));
                const sessionModel = ctx.model ? { id: ctx.model.id, provider: ctx.model.provider } : undefined;
                const currentModelId = resolveCurrentModelId(model, availableModels, sessionModel);
                const defaultModel = readModel();
                if (parsed.dryRun) {
                    if (parsed.ssh) {
                        const drySSHContextFiles = (await collectProviderContext(pi.events, ctx.cwd, [])).flatMap(g => g.files);
                        notify(`System prompt:\n\n${buildMarkdownSystemPrompt(minSeverity, undefined, drySSHContextFiles)}`);
                        notify(`User prompt:\n\n${buildSSHUserPrompt(buildSSHDiffCommand(parsed))}`);
                    }
                    else {
                        const { diff, source, skippedFiles } = await resolveDiff({ cwd: ctx.cwd, diff: parsed.diff, branch: parsed.branch ?? readDefaultBranch(), pr: parsed.pr, dir: parsed.dir });
                        const context = await loadContext({ cwd: parsed.dir ? path.resolve(ctx.cwd, parsed.dir) : ctx.cwd, gitRoot: parsed.dir ? ctx.cwd : undefined });
                        const dryDiffFiles = extractDiffFiles(diff);
                        const dryContextFiles = (await collectProviderContext(pi.events, ctx.cwd, dryDiffFiles)).flatMap(g => g.files);
                        notify(`Diff source: ${source}`);
                        notify(`System prompt:\n\n${buildJSONSystemPrompt(context, minSeverity, dryContextFiles)}`);
                        notify(`User prompt:\n\n${buildUserPrompt(diff, skippedFiles)}`);
                    }
                    return;
                }
                // ── SSH ───────────────────────────────────────────────────────────
                if (parsed.ssh) {
                    notify("Fetching SSH diff and context…");
                    const sshFlag = readSshFlag();
                    const sshState = sshFlag ? await resolveSshState(sshFlag).catch(() => null) : null;
                    const sshRemoteCwd = sshState ? (parsed.dir ? path.posix.join(sshState.remoteCwd, parsed.dir) : sshState.remoteCwd) : ctx.cwd;
                    const providerFs = sshState ? makeSshFs(sshState.remote) : localFs();
                    const g = `git -C ${JSON.stringify(sshRemoteCwd)}`;
                    const [sshContext, rawSshDiff, sshHeadBranch, sshOriginBase] = await Promise.all([
                        sshState
                            ? loadContextSSH(sshState.remote, sshRemoteCwd, parsed.dir ? sshState.remoteCwd : undefined)
                                .catch(() => ({ conventions: [], reviewRules: [] }))
                            : Promise.resolve({ conventions: [], reviewRules: [] }),
                        sshState
                            ? sshExec(sshState.remote, buildSSHDiffCommand(parsed, { remoteCwd: sshRemoteCwd, branch: readDefaultBranch() })).catch(() => "")
                            : Promise.resolve(""),
                        sshState
                            ? sshExec(sshState.remote, `${g} rev-parse --abbrev-ref HEAD`).catch(() => "HEAD")
                            : Promise.resolve("HEAD"),
                        sshState
                            ? sshExec(sshState.remote, buildSSHOriginBaseCommand(g)).catch(() => "origin/main")
                            : Promise.resolve("origin/main"),
                    ]);
                    const source = buildSSHSource(parsed, { branch: readDefaultBranch(), head: sshHeadBranch.trim() || "HEAD", detectedBase: sshOriginBase.trim() || undefined });
                    const { diff: sshDiff, warning: sshDiffWarning, skippedFiles: sshSkippedFiles } = filterDiff(rawSshDiff);
                    if (sshDiffWarning)
                        notify(sshDiffWarning, "warning");
                    const sshDiffFiles = extractDiffFiles(rawSshDiff);
                    const sshProviderGroups = await collectProviderContext(pi.events, sshRemoteCwd, sshDiffFiles, providerFs);
                    const sshContextFiles = sshProviderGroups.flatMap(g => g.files);
                    const allSshContextPaths = [...mergeContextFiles(sshContext).map(f => f.path), ...sshContextFiles.map(f => f.path)];
                    if (allSshContextPaths.length > 0)
                        notify(`Context: ${allSshContextPaths.join(", ")}`);
                    const sshBuiltInFiles = mergeContextFiles(sshContext);
                    const sshAllContextGroups = [
                        ...(sshBuiltInFiles.length > 0 ? [{ name: "built-in", files: sshBuiltInFiles }] : []),
                        ...sshProviderGroups,
                    ];
                    const userPrompt = buildUserPrompt(sshDiff, sshSkippedFiles);
                    if (!parsed.ui) {
                        // SSH-only: diff pre-fetched; agent reviews and saves markdown
                        const systemPrompt = buildMarkdownSystemPrompt(minSeverity, sshContext, sshContextFiles);
                        stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
                        runSSHReview({ systemPrompt, userPrompt, pi, stopLoader, notify });
                        return;
                    }
                    // SSH+UI: diff pre-fetched; agent reviews only
                    const systemPrompt = buildJSONSystemPrompt(sshContext, minSeverity, sshContextFiles);
                    stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
                    const result = await runSSHReviewAndWait({ systemPrompt, userPrompt, diff: sshDiff, pi, minSeverity, stopLoader, notify });
                    const conventions = mergeContextFiles(sshContext).map(f => f.content).join("\n\n");
                    let sshSaveTriggered = false;
                    const injectionMsg = await handleUIReview({
                        result, diff: sshDiff, conventions, source, ssh: true, cwd: ctx.cwd, notify,
                        currentModel: currentModelId, currentThinking: thinking, defaultModel, availableModels, defaultThinking: readThinking(),
                        contextGroups: sshAllContextGroups,
                        saveRemote: (md) => {
                            sshSaveTriggered = true;
                            pi.sendUserMessage(`Run \`git rev-parse --show-toplevel\` to get the project root path, then write the following content to that path + "/pi-review.md" (e.g. if the root is /some/path, write to /some/path/pi-review.md):\n\n${md}`);
                        },
                    });
                    if (injectionMsg) {
                        if (sshSaveTriggered) {
                            // Save already triggered the agent; send injection after that turn completes
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
                    return;
                }
                // ── Local ─────────────────────────────────────────────────────────
                notify("Fetching diff…");
                const { diff, source, warning, skippedFiles } = await resolveDiff({ cwd: ctx.cwd, diff: parsed.diff, branch: parsed.branch ?? readDefaultBranch(), pr: parsed.pr, dir: parsed.dir });
                if (warning)
                    notify(warning, "warning");
                notify("Loading context…");
                const context = await loadContext({ cwd: parsed.dir ? path.resolve(ctx.cwd, parsed.dir) : ctx.cwd, gitRoot: parsed.dir ? ctx.cwd : undefined });
                const conventions = mergeContextFiles(context).map(f => f.content).join("\n\n");
                const diffFiles = extractDiffFiles(diff);
                const providerGroups = await collectProviderContext(pi.events, ctx.cwd, diffFiles);
                const contextFiles = providerGroups.flatMap(g => g.files);
                const allContextPaths = [...mergeContextFiles(context).map(f => f.path), ...contextFiles.map(f => f.path)];
                if (allContextPaths.length > 0)
                    notify(`Context: ${allContextPaths.join(", ")}`);
                const systemPrompt = buildJSONSystemPrompt(context, minSeverity, contextFiles);
                const builtInFiles = mergeContextFiles(context);
                const allContextGroups = [
                    ...(builtInFiles.length > 0 ? [{ name: "built-in", files: builtInFiles }] : []),
                    ...providerGroups,
                ];
                const userPrompt = buildUserPrompt(diff, skippedFiles);
                stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
                const result = await runLocalReview({ systemPrompt, userPrompt, cwd: ctx.cwd, minSeverity, verbose, model, thinking, stopLoader, notify });
                if (parsed.ui) {
                    const injectionMsg = await handleUIReview({ result, diff, conventions, source, cwd: ctx.cwd, notify, currentModel: currentModelId, defaultModel, availableModels, contextGroups: allContextGroups });
                    if (injectionMsg)
                        pi.sendUserMessage(injectionMsg);
                    return;
                }
                const formatted = formatForTerminal(result);
                const date = new Date().toISOString().replace("T", " ").slice(0, 19);
                await writeFile(path.join(ctx.cwd, "pi-review.md"), `# Pi Review — ${source}\n\n> ${date}\n\n---\n\n${formatted}\n`, "utf-8");
                notify("Review saved → pi-review.md");
            }
            catch (error) {
                stopLoader();
                const message = error instanceof Error ? error.message : String(error);
                const hint = !sshMode && message.includes("not a git repository")
                    ? "\n\nNot in a git repository — if you're in an SSH session, try adding --ssh."
                    : "";
                notify(`Review failed: ${message}${hint}`, "error");
            }
        },
    });
}
