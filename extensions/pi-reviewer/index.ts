import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { loadContext } from "../../src/core/context.js";
import { resolveDiff, detectCurrentBranch, detectOriginBase } from "../../src/core/diff-resolver.js";
import { filterDiff } from "../../src/core/diff-filter.js";
import { formatForTerminal } from "../../src/core/output.js";
import { buildJSONSystemPrompt, buildMarkdownSystemPrompt, buildSSHUserPrompt, buildUserPrompt } from "../../src/core/prompt-builder.js";
import { readVerbose, readMinSeverity, readModel, readThinking } from "../../src/core/ui/server/index.js";
import type { ReviewCommandArgs } from "./args.js";
import { parseArgs } from "./args.js";
import { setReviewFooter } from "./footer.js";
import { runLocalReview } from "./run-local.js";
import { runSSHReview, runSSHReviewAndWait } from "./run-ssh.js";
import { handleUIReview } from "./ui-handler.js";

function buildSSHDiffCommand(parsed: ReviewCommandArgs): string {
  if (typeof parsed.pr === "number") return `gh pr diff ${parsed.pr}`;
  if (parsed.diff) return `git diff ${parsed.diff}`;
  if (parsed.branch) return `git diff $(git merge-base ${parsed.branch} HEAD)`;
  return `git diff $(git merge-base $(git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null || echo origin/main) HEAD)`;
}

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
        const currentModelEntry = model
          ? availableModels.find((m) => m.id === model || `${m.provider}/${m.id}` === model)
          : ctx.model
          ? { id: ctx.model.id as string, provider: ctx.model.provider as string }
          : undefined;
        const currentModelId = currentModelEntry
          ? `${currentModelEntry.provider}/${currentModelEntry.id}`
          : model;
        const defaultModel = readModel();

        if (parsed.dryRun) {
          if (parsed.ssh) {
            notify(`System prompt:\n\n${buildMarkdownSystemPrompt(minSeverity)}`);
            notify(`User prompt:\n\n${buildSSHUserPrompt(buildSSHDiffCommand(parsed))}`);
          } else {
            const { diff, source, skippedFiles } = await resolveDiff({ cwd: ctx.cwd, diff: parsed.diff, branch: parsed.branch, pr: parsed.pr });
            const context = await loadContext({ cwd: ctx.cwd });
            notify(`Diff source: ${source}`);
            notify(`System prompt:\n\n${buildJSONSystemPrompt(context, minSeverity)}`);
            notify(`User prompt:\n\n${buildUserPrompt(diff, skippedFiles)}`);
          }
          return;
        }

        // ── SSH ───────────────────────────────────────────────────────────
        if (parsed.ssh) {
          const diffCommand = buildSSHDiffCommand(parsed);
          const source = buildSSHSource(parsed, ctx.cwd);
          const userPrompt = buildSSHUserPrompt(diffCommand);

          if (!parsed.ui) {
            // SSH-only: agent fetches diff, reviews, saves markdown
            const systemPrompt = buildMarkdownSystemPrompt(minSeverity);
            stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
            runSSHReview({ systemPrompt, userPrompt, pi, stopLoader, notify });
            return;
          }

          // SSH+UI: agent fetches diff, reviews; diff is captured from bash tool result
          const systemPrompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "" }, minSeverity);
          stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
          const result = await runSSHReviewAndWait({ systemPrompt, userPrompt, pi, minSeverity, stopLoader, notify });
          if (!result.diff) notify("Diff not captured — UI diff view will be empty", "warning");
          const { diff, warning } = filterDiff(result.diff ?? "");
          if (warning) notify(warning, "warning");
          let sshSaveTriggered = false;
          const injectionMsg = await handleUIReview({
            result, diff, conventions: "", source, ssh: true, cwd: ctx.cwd, notify,
            currentModel: currentModelId, currentThinking: thinking, defaultModel, availableModels, defaultThinking: readThinking(),
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
        const { diff, source, warning, skippedFiles } = await resolveDiff({ cwd: ctx.cwd, diff: parsed.diff, branch: parsed.branch, pr: parsed.pr });
        if (warning) notify(warning, "warning");
        notify("Loading context…");
        const context = await loadContext({ cwd: ctx.cwd });
        if ((context.loadedFiles?.length ?? 0) > 0) notify(`Context: ${context.loadedFiles?.join(", ")}`);
        const conventions = [context.conventions, context.reviewRules].filter(Boolean).join("\n\n");
        const systemPrompt = buildJSONSystemPrompt(context, minSeverity);
        const userPrompt = buildUserPrompt(diff, skippedFiles);

        stopLoader = setReviewFooter(ctx, source, { model: currentModelId, thinking });
        const result = await runLocalReview({ systemPrompt, userPrompt, cwd: ctx.cwd, minSeverity, verbose, model, thinking, stopLoader, notify });

        if (parsed.ui) {
          const injectionMsg = await handleUIReview({ result, diff, conventions, source, cwd: ctx.cwd, notify, currentModel: currentModelId, defaultModel, availableModels });
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
