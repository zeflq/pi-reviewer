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

function extractAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message.role !== "assistant") continue;

    if (typeof message.content === "string") return message.content;

    if (Array.isArray(message.content)) {
      return message.content
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

          const parseLine = (line: string) => {
            if (!line.trim()) return;

            let event: any;
            try {
              event = JSON.parse(line);
            } catch {
              ctx.ui.notify(`Failed to parse subprocess JSON line: ${line}`, "error");
              return;
            }

            if (event?.type === "agent_end") {
              const text = extractAssistantText(event.messages);
              ctx.ui.setStatus("pi-reviewer", undefined);
              ctx.ui.notify(text || "Review completed (no assistant text returned).");
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

              if (code && code !== 0) {
                reject(new Error(`pi process exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
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
