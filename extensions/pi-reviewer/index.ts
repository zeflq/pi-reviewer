import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { loadContext } from "../../src/core/context.js";
import { resolveDiff } from "../../src/core/diff-resolver.js";
import { formatForTerminal } from "../../src/core/output.js";
import { buildSSHSystemPrompt, buildSSHUserPrompt, buildSystemPrompt, buildUserPrompt } from "../../src/core/prompt-builder.js";
import { parseArgs } from "./args.js";
import { setReviewFooter } from "./footer.js";
import { runLocalReview } from "./run-local.js";
import { runSSHReview } from "./run-ssh.js";
import { handleUIReview } from "./ui-handler.js";

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --ssh, --ui, --dry-run)",
    async handler(args, ctx) {
      const notify = ctx.ui.notify.bind(ctx.ui);
      let stopLoader: () => void = () => {};
      try {
        const parsed = parseArgs(args);

        // ── Build prompts ───────────────────────────────────────────────
        let systemPrompt: string;
        let userPrompt: string;
        let source: string;
        let resolvedDiff = "";
        let conventions = "";

        if (parsed.ssh) {
          systemPrompt = buildSSHSystemPrompt(parsed.minSeverity);
          userPrompt = buildSSHUserPrompt({ branch: parsed.branch, diff: parsed.diff, pr: parsed.pr });
          source = "remote (ssh)";
        } else {
          const { diff, source: src, warning, skippedFiles } = await resolveDiff({
            cwd: ctx.cwd, diff: parsed.diff, branch: parsed.branch, pr: parsed.pr,
          });
          resolvedDiff = diff;
          if (warning) notify(warning, "warning");
          const context = await loadContext({ cwd: ctx.cwd });
          if ((context.loadedFiles?.length ?? 0) > 0) notify(`Context: ${context.loadedFiles?.join(", ")}`);
          conventions = [context.conventions, context.reviewRules].filter(Boolean).join("\n\n");
          systemPrompt = buildSystemPrompt(context, parsed.minSeverity);
          userPrompt = buildUserPrompt(diff, skippedFiles);
          source = src;
        }

        if (parsed.dryRun) {
          notify(`Diff source: ${source}`);
          notify(`System prompt:\n\n${systemPrompt}`);
          notify(`User prompt:\n\n${userPrompt}`);
          return;
        }

        stopLoader = setReviewFooter(ctx, source);

        // ── SSH mode ────────────────────────────────────────────────────
        if (parsed.ssh) {
          runSSHReview({ systemPrompt, userPrompt, pi, stopLoader, notify });
          return;
        }

        // ── Local mode ──────────────────────────────────────────────────
        const result = await runLocalReview({
          systemPrompt, userPrompt, cwd: ctx.cwd,
          minSeverity: parsed.minSeverity, stopLoader, notify,
        });

        if (parsed.ui) {
          await handleUIReview({ result, diff: resolvedDiff, conventions, source, cwd: ctx.cwd, notify, sendMessage: pi.sendUserMessage.bind(pi) });
          return;
        }

        // Default: write pi-review.md immediately
        const formatted = formatForTerminal(result);
        const date = new Date().toISOString().replace("T", " ").slice(0, 19);
        const markdown = `# Pi Review — ${source}\n\n> ${date}\n\n---\n\n${formatted}\n`;
        await writeFile(path.join(ctx.cwd, "pi-review.md"), markdown, "utf-8");
        notify("Review saved → pi-review.md");
      } catch (error) {
        stopLoader();
        notify(`Review failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
