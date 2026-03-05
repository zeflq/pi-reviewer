import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { loadContext } from "../../src/context.js";
import { resolveDiff } from "../../src/diff-resolver.js";
import { buildSystemPrompt, buildUserPrompt } from "../../src/prompt-builder.js";

interface ReviewCommandArgs {
  diff?: string;
  branch?: string;
  pr?: number;
  dryRun: boolean;
}

function parseArgs(rawArgs: string): ReviewCommandArgs {
  const tokens = rawArgs.trim() ? rawArgs.trim().split(/\s+/) : [];
  const parsed: ReviewCommandArgs = { dryRun: false };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (token === "--diff") {
      const value = tokens[i + 1];
      if (!value) throw new Error("Missing value for --diff");
      parsed.diff = value;
      i += 1;
      continue;
    }

    if (token === "--branch") {
      const value = tokens[i + 1];
      if (!value) throw new Error("Missing value for --branch");
      parsed.branch = value;
      i += 1;
      continue;
    }

    if (token === "--pr") {
      const value = tokens[i + 1];
      if (!value) throw new Error("Missing value for --pr");
      const pr = Number.parseInt(value, 10);
      if (Number.isNaN(pr)) throw new Error(`Invalid PR number: ${value}`);
      parsed.pr = pr;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

function extractAssistantText(message: unknown): string {
  const msg = message as { role?: string; content?: unknown };
  if (msg?.role !== "assistant") return "";

  if (typeof msg.content === "string") return msg.content;

  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "type" in part && (part as { type?: string }).type === "text") {
          return (part as { text?: string }).text ?? "";
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --dry-run)",
    async handler(args, ctx) {
      try {
        const parsed = parseArgs(args);
        const { diff, source } = await resolveDiff({
          cwd: ctx.cwd,
          diff: parsed.diff,
          branch: parsed.branch,
          pr: parsed.pr,
        });

        const context = await loadContext({ cwd: ctx.cwd });
        const systemPrompt = buildSystemPrompt(context);
        const userPrompt = buildUserPrompt(diff);

        if (parsed.dryRun) {
          ctx.ui.notify(`Diff source: ${source}`);
          ctx.ui.notify(`System prompt:\n\n${systemPrompt}`);
          ctx.ui.notify(`User prompt:\n\n${userPrompt}`);
          return;
        }

        ctx.ui.setStatus("pi-reviewer", `Reviewing ${source}...`);

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
          let agentEndReceived = false;

          const parseLine = (line: string) => {
            if (!line.trim()) return;

            let event: any;
            try {
              event = JSON.parse(line);
            } catch {
              // not JSON — log raw line for debugging
              ctx.ui.notify(`[pi-reviewer] unexpected output: ${line}`, "error");
              return;
            }

            if (event?.type === "turn_end") {
              agentEndReceived = true;
              const text = extractAssistantText(event.message);
              ctx.ui.setStatus("pi-reviewer", undefined);
              if (!text) {
                ctx.ui.notify("Review completed but agent returned no text.", "error");
                return;
              }
              const outPath = path.join(ctx.cwd, "pi-review.md");
              writeFile(outPath, text, "utf-8")
                .then(() => ctx.ui.notify(`Review saved → pi-review.md`))
                .catch((err) => ctx.ui.notify(`Failed to write pi-review.md: ${err.message}`, "error"));
            }
          };

          const streamPromise = new Promise<void>((resolve, reject) => {
            proc.stdout.on("data", (chunk) => {
              stdoutBuffer += chunk.toString();
              const lines = stdoutBuffer.split("\n");
              stdoutBuffer = lines.pop() ?? "";

              for (const line of lines) {
                parseLine(line);
              }
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
              if (stdoutBuffer.trim()) {
                parseLine(stdoutBuffer);
              }

              ctx.ui.setStatus("pi-reviewer", undefined);

              if (code && code !== 0) {
                reject(new Error(`pi process exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
                return;
              }

              if (!agentEndReceived) {
                const hint = stderr.trim() ? `\n${stderr.trim()}` : "";
                reject(new Error(`pi process exited without producing a review.${hint}`));
                return;
              }

              resolve();
            });
          });

          await streamPromise;
        } finally {
          await unlink(tempPath).catch(() => undefined);
        }
      } catch (error) {
        ctx.ui.setStatus("pi-reviewer", undefined);
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Review failed: ${message}`, "error");
      }
    },
  });
}
