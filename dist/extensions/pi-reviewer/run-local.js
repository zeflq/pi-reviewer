import { spawn } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAgentResponse } from "../../src/core/output.js";
import { createEventAccumulator } from "./events.js";
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
                resolve(parseAgentResponse(reviewText, minSeverity));
            });
        });
    }
    finally {
        await unlink(tempPath).catch(() => undefined);
    }
}
