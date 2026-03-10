import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { loadContext } from "../../src/context.js";
import { resolveDiff } from "../../src/diff-resolver.js";
import { formatForTerminal, parseAgentResponse } from "../../src/output.js";
import { buildSSHSystemPrompt, buildSSHUserPrompt, buildSystemPrompt, buildUserPrompt } from "../../src/prompt-builder.js";
import { parseArgs } from "./args.js";
import { createEventAccumulator } from "./events.js";
import { setReviewFooter } from "./footer.js";


export default function (pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --ssh, --dry-run)",
    async handler(args, ctx) {
      let stopLoader: () => void = () => {};
      try {
        const parsed = parseArgs(args);

        let systemPrompt: string;
        let userPrompt: string;
        let source: string;

        if (parsed.ssh) {
          systemPrompt = buildSSHSystemPrompt(parsed.minSeverity);
          userPrompt = buildSSHUserPrompt({ branch: parsed.branch, diff: parsed.diff, pr: parsed.pr });
          source = "remote (ssh)";
        } else {
          const { diff, source: resolvedSource, warning } = await resolveDiff({
            cwd: ctx.cwd,
            diff: parsed.diff,
            branch: parsed.branch,
            pr: parsed.pr,
          });
          if (warning) ctx.ui.notify(warning, "warning");
          const context = await loadContext({ cwd: ctx.cwd });
          systemPrompt = buildSystemPrompt(context, parsed.minSeverity);
          userPrompt = buildUserPrompt(diff);
          source = resolvedSource;
        }

        if (parsed.dryRun) {
          ctx.ui.notify(`Diff source: ${source}`);
          ctx.ui.notify(`System prompt:\n\n${systemPrompt}`);
          ctx.ui.notify(`User prompt:\n\n${userPrompt}`);
          return;
        }

        stopLoader = setReviewFooter(ctx, source);

        if (parsed.ssh) {
          // In SSH mode, run the review inside the current session so the agent's
          // tools (Bash, Read, Write) are already SSH-redirected — no subprocess needed.
          // Single-turn: user prompt instructs the agent to fetch diff, review,
          // and write pi-review.md via the Write tool in one pass.
          let done = false;

          pi.on("before_agent_start", async () => {
            if (done) return {};
            return { systemPrompt };
          });

          pi.on("agent_end", async () => {
            if (done) return;
            done = true;
            stopLoader();
            ctx.ui.notify("Review saved → pi-review.md");
          });

          pi.sendUserMessage(userPrompt);
          return;
        }

        const tempPath = path.join(tmpdir(), `pi-reviewer-system-prompt-${randomUUID()}.md`);
        await writeFile(tempPath, systemPrompt, { encoding: "utf-8", mode: 0o600 });

        try {
          const proc = spawn(
            "pi",
            ["--mode", "json", "-p", "--no-session", "--append-system-prompt", tempPath, userPrompt],
            {
              cwd: ctx.cwd,
              env: process.env,
              shell: false,
              stdio: ["ignore", "pipe", "pipe"],
            }
          );

          let stderr = "";
          let stdoutBuffer = "";
          const accumulator = createEventAccumulator((line) => {
            ctx.ui.notify(`[pi-reviewer] unexpected output: ${line}`, "error");
          });

          const streamPromise = new Promise<void>((resolve, reject) => {
            proc.stdout.on("data", (chunk) => {
              stdoutBuffer += chunk.toString();
              const lines = stdoutBuffer.split("\n");
              stdoutBuffer = lines.pop() ?? "";
              for (const line of lines) accumulator.process(line);
            });

            proc.stderr.on("data", (chunk) => {
              stderr += chunk.toString();
            });

            proc.on("error", (error) => {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                reject(new Error('Failed to run "pi": binary not found in PATH.'));
                return;
              }
              reject(error);
            });

            proc.on("close", (code) => {
              if (stdoutBuffer.trim()) accumulator.process(stdoutBuffer);
              stopLoader();

              if (code && code !== 0) {
                reject(new Error(`pi process exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
                return;
              }

              const reviewText = accumulator.getLastReviewText();
              if (!reviewText) {
                const hint = stderr.trim() ? `\n${stderr.trim()}` : "";
                reject(new Error(`pi process exited without producing a review.${hint}`));
                return;
              }

              const formatted = formatForTerminal(parseAgentResponse(reviewText, parsed.minSeverity));
              const date = new Date().toISOString().replace("T", " ").slice(0, 19);
              const markdown = `# Pi Review — ${source}\n\n> ${date}\n\n---\n\n${formatted}\n`;
              const outPath = path.join(ctx.cwd, "pi-review.md");
              writeFile(outPath, markdown, "utf-8")
                .then(() => ctx.ui.notify(`Review saved → pi-review.md`))
                .catch((err) => ctx.ui.notify(`Failed to write pi-review.md: ${err.message}`, "error"));

              resolve();
            });
          });

          await streamPromise;
        } finally {
          await unlink(tempPath).catch(() => undefined);
        }
      } catch (error) {
        stopLoader();
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Review failed: ${message}`, "error");
      }
    },
  });
}
