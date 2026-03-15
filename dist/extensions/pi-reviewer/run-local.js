import { spawn } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAgentResponse } from "../../src/core/output.js";
import { createEventAccumulator } from "./events.js";
export async function runLocalReview(opts) {
    const { systemPrompt, userPrompt, cwd, minSeverity, stopLoader, notify } = opts;
    const tempPath = path.join(tmpdir(), `pi-reviewer-system-prompt-${randomUUID()}.md`);
    await writeFile(tempPath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
    try {
        const proc = spawn("pi", ["--mode", "json", "-p", "--no-session", "--append-system-prompt", tempPath, userPrompt], { cwd, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        let stdoutBuffer = "";
        const accumulator = createEventAccumulator((line) => {
            notify(`[pi-reviewer] unexpected output: ${line}`, "error");
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
            proc.on("close", (code) => {
                if (stdoutBuffer.trim())
                    accumulator.process(stdoutBuffer);
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
                resolve(parseAgentResponse(reviewText, minSeverity));
            });
        });
    }
    finally {
        await unlink(tempPath).catch(() => undefined);
    }
}
