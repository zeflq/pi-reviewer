import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { parseAgentResponse, type ReviewResult } from "../../src/core/output.js";
import type { MinSeverity } from "../../src/core/prompt-builder.js";
import { extractLastAssistantText } from "./events.js";

export interface RunSSHOptions {
  systemPrompt: string;
  userPrompt: string;
  pi: ExtensionAPI;
  stopLoader: () => void;
  notify: (msg: string) => void;
}

export function runSSHReview(opts: RunSSHOptions): void {
  const { systemPrompt, userPrompt, pi, stopLoader, notify } = opts;
  let done = false;

  pi.on("before_agent_start", async () => {
    if (done) return {};
    return { systemPrompt };
  });

  pi.on("agent_end", async () => {
    if (done) return;
    done = true;
    stopLoader();
    notify("Review saved → pi-review.md");
  });

  pi.sendUserMessage(userPrompt);
}

export interface RunSSHWaitOptions {
  systemPrompt: string;
  userPrompt: string;
  pi: ExtensionAPI;
  minSeverity: MinSeverity;
  stopLoader: () => void;
  notify: (msg: string, type?: "info" | "warning" | "error") => void;
}

export function runSSHReviewAndWait(opts: RunSSHWaitOptions): Promise<ReviewResult> {
  const { systemPrompt, userPrompt, pi, minSeverity, stopLoader, notify } = opts;
  let done = false;

  return new Promise<ReviewResult>((resolve, reject) => {
    pi.on("before_agent_start", async () => {
      if (done) return {};
      return { systemPrompt };
    });

    pi.on("agent_end", async (event) => {
      if (done) return;
      done = true;
      stopLoader();

      const text = extractLastAssistantText(event.messages);
      if (!text) {
        reject(new Error("SSH agent returned an empty response"));
        return;
      }

      try {
        resolve(parseAgentResponse(text, minSeverity));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    pi.sendUserMessage(userPrompt);
  });
}
