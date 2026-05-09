import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { loadContext, collectProviderContext, mergeContextFiles, type ContextGroup } from "../../src/core/context.js";
import { resolveDiff, detectCurrentBranch, detectOriginBase, extractDiffFiles } from "../../src/core/diff-resolver.js";
import { filterDiff } from "../../src/core/diff-filter.js";
import { formatForTerminal } from "../../src/core/output.js";
import { buildJSONSystemPrompt, buildMarkdownSystemPrompt, buildSSHUserPrompt, buildUserPrompt } from "../../src/core/prompt-builder.js";
import { readVerbose, readMinSeverity, readModel, readThinking, readDefaultBranch } from "../../src/core/ui/server/index.js";
import { loadContextSSH } from "../../src/core/context.js";
import { readSshFlag, resolveSshState, localFs, sshFs as makeSshFs } from "../../src/core/ssh.js";
import type { ReviewCommandArgs } from "./args.js";
import { parseArgs, buildSSHDiffCommand } from "./args.js";
import { resolveCurrentModelId } from "./model.js";
import { setReviewFooter } from "./footer.js";
import { runLocalReview } from "./run-local.js";
import { runSSHReview, runSSHReviewAndWait } from "./run-ssh.js";
import { handleUIReview } from "./ui-handler.js";

export function buildSSHSource(parsed: ReviewCommandArgs, cwd: string): string {
  if (typeof parsed.pr === "number") return `PR #${parsed.pr}`;
  if (parsed.diff) return `git diff ${parsed.diff}`;
  const head = detectCurrentBranch(cwd);
  const base = parsed.branch ?? detectOriginBase(cwd);
  return `${head} vs ${base}`;
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --ssh, --ui, --dry-run)",
    async handler(args, ctx) {
      const notify = ctx.ui.notify.bind(ctx.ui);
      let stopLoader: () => void = () => {};
      try {
        const parsed = parseArgs(args);

        const minSeverity = parsed.minSeverity ?? readMinSeverity();
        const verbose = parsed.verbose ?? readVerbose();
        const model = parsed.model ?? readModel();
        const thinking = parsed.thinking ?? readThinking();

        const availableModels = ctx.modelRegistry.getAvailable().map((m) => ({
          id: m.id as string,
          name: m.name as string,
          provider: m.provider as string,
        }));
        const sessionModel = ctx.model ? { id: ctx.model.id as string, provider: ctx.model.provider as string } : undefined;
        const currentModelId = resolveCurrentModelId(model, availableModels, sessionModel);
        const defaultModel = readModel();

        if (parsed.dryRun) {
          if (parsed.ssh) {
            const drySSHContextFiles = (await collectProviderContext(pi.events, ctx.cwd, [])).flatMap(g => g.files);
            notify(`System prompt:\n\n${buildMarkdownSystemPrompt(minSeverity, undefined, drySSHContextFiles)}`);
            notify(`User prompt:\n\n${buildSSHUserPrompt(buildSSHDiffCommand(parsed))}`);
          } else {
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
          const diffCommand = buildSSHDiffCommand(parsed);
          const source = buildSSHSource(parsed, ctx.cwd);
          const userPrompt = buildSSHUserPrompt(diffCommand);

          notify("Loading context…");
          const sshFlag = readSshFlag();
          const sshState = sshFlag ? await resolveSshState(sshFlag).catch(() => null) : null;
          const sshRemoteCwd = sshState ? (parsed.dir ? path.posix.join(sshState.remoteCwd, parsed.dir) : sshState.remoteCwd) : ctx.cwd;
          const providerFs = sshState ? makeSshFs(sshState.remote) : localFs();
          const sshContext = sshState
            ? await loadContextSSH(sshState.remote, sshRemoteCwd, parsed.dir ? sshState.remoteCwd : undefined)
                .catch(() => ({ conventions: [], reviewRules: [] }))
            : { conventions: [], reviewRules: [] };
          // diffFiles unavailable in SSH mode (agent fetches diff itself) — providers run with []
          const sshProviderGroups = await collectProviderContext(pi.events, sshRemoteCwd, [], providerFs);
          const sshContextFiles = sshProviderGroups.flatMap(g => g.files);
          const allSshContextPaths = [...mergeContextFiles(sshContext).map(f => f.path), ...sshContextFiles.map(f => f.path)];
          if (allSshContextPaths.length > 0) notify(`Context: ${allSshContextPaths.join(", ")}`);
          const sshBuiltInFiles = mergeContextFiles(sshContext);
          const sshAllContextGroups: ContextGroup[] = [
            ...(sshBuiltInFiles.length > 0 ? [{ name: "built-in", files: sshBuiltInFiles }] : []),
            ...sshProviderGroups,
          ];

          if (!parsed.ui) {
            // SSH-only: agent fetches diff, reviews, saves markdown
            const systemPrompt = buildMarkdownSystemPrompt(minSeverity, sshContext, sshContextFiles);
            stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
            runSSHReview({ systemPrompt, userPrompt, pi, stopLoader, notify });
            return;
          }

          // SSH+UI: agent fetches diff, reviews; diff is captured from bash tool result
          const systemPrompt = buildJSONSystemPrompt(sshContext, minSeverity, sshContextFiles);
          stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
          const result = await runSSHReviewAndWait({ systemPrompt, userPrompt, pi, minSeverity, stopLoader, notify });
          if (!result.diff) notify("Diff not captured — UI diff view will be empty", "warning");
          const { diff, warning } = filterDiff(result.diff ?? "");
          if (warning) notify(warning, "warning");
          const conventions = mergeContextFiles(sshContext).map(f => f.content).join("\n\n");
          let sshSaveTriggered = false;
          const injectionMsg = await handleUIReview({
            result, diff, conventions, source, ssh: true, cwd: ctx.cwd, notify,
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
                if (sent) return;
                sent = true;
                pi.sendUserMessage(injectionMsg);
              });
            } else {
              pi.sendUserMessage(injectionMsg);
            }
          }
          return;
        }

        // ── Local ─────────────────────────────────────────────────────────
        notify("Fetching diff…");
        const { diff, source, warning, skippedFiles } = await resolveDiff({ cwd: ctx.cwd, diff: parsed.diff, branch: parsed.branch ?? readDefaultBranch(), pr: parsed.pr, dir: parsed.dir });
        if (warning) notify(warning, "warning");
        notify("Loading context…");
        const context = await loadContext({ cwd: parsed.dir ? path.resolve(ctx.cwd, parsed.dir) : ctx.cwd, gitRoot: parsed.dir ? ctx.cwd : undefined });
        const conventions = mergeContextFiles(context).map(f => f.content).join("\n\n");
        const diffFiles = extractDiffFiles(diff);
        const providerGroups = await collectProviderContext(pi.events, ctx.cwd, diffFiles);
        const contextFiles = providerGroups.flatMap(g => g.files);
        const allContextPaths = [...mergeContextFiles(context).map(f => f.path), ...contextFiles.map(f => f.path)];
        if (allContextPaths.length > 0) notify(`Context: ${allContextPaths.join(", ")}`);
        const systemPrompt = buildJSONSystemPrompt(context, minSeverity, contextFiles);
        const builtInFiles = mergeContextFiles(context);
        const allContextGroups: ContextGroup[] = [
          ...(builtInFiles.length > 0 ? [{ name: "built-in", files: builtInFiles }] : []),
          ...providerGroups,
        ];
        const userPrompt = buildUserPrompt(diff, skippedFiles);

        stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
        const result = await runLocalReview({ systemPrompt, userPrompt, cwd: ctx.cwd, minSeverity, verbose, model, thinking, stopLoader, notify });

        if (parsed.ui) {
          const injectionMsg = await handleUIReview({ result, diff, conventions, source, cwd: ctx.cwd, notify, currentModel: currentModelId, defaultModel, availableModels, contextGroups: allContextGroups });
          if (injectionMsg) pi.sendUserMessage(injectionMsg);
          return;
        }

        const formatted = formatForTerminal(result);
        const date = new Date().toISOString().replace("T", " ").slice(0, 19);
        await writeFile(path.join(ctx.cwd, "pi-review.md"), `# Pi Review — ${source}\n\n> ${date}\n\n---\n\n${formatted}\n`, "utf-8");
        notify("Review saved → pi-review.md");
      } catch (error) {
        stopLoader();
        notify(`Review failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
