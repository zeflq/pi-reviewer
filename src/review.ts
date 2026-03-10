import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { createReadOnlyTools } from "@mariozechner/pi-coding-agent";

import { loadContext } from "./context.js";
import { resolveDiff } from "./diff-resolver.js";
import { sendOutput, type OutputTarget, type Severity } from "./output.js";
import { buildSystemPrompt, buildUserPrompt, type MinSeverity } from "./prompt-builder.js";

export interface ReviewOptions {
  cwd?: string;
  pr?: number;
  diff?: string;
  branch?: string;
  output?: OutputTarget;
  dryRun?: boolean;
  githubToken?: string;
  anthropicApiKey?: string;
  repo?: string;
  commitId?: string;
  model?: string; // format: "provider/modelId" e.g. "anthropic/claude-opus-4-6"
  minSeverity?: MinSeverity;
}

function extractAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message?.role !== "assistant") continue;

    if (typeof message.content === "string") {
      return message.content;
    }

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

export async function review(options: ReviewOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN;
  const repo = options.repo ?? process.env.GITHUB_REPOSITORY;

  const { diff, source, warning, skippedFiles } = await resolveDiff({
    pr: options.pr,
    diff: options.diff,
    branch: options.branch,
    cwd,
  });
  console.log(`[pi-reviewer] diff resolved — source: ${source}, size: ${diff.length} chars`);
  if (warning) console.warn(`[pi-reviewer] ${warning}`);

  const context = await loadContext({ cwd });
  const hasConventions = context.conventions.trim() || context.reviewRules.trim();
  console.log(`[pi-reviewer] context: ${hasConventions ? "conventions loaded" : "no conventions found"}`);

  const systemPrompt = buildSystemPrompt(context, options.minSeverity);
  const userPrompt = buildUserPrompt(diff, skippedFiles);

  const target: OutputTarget =
    options.output ?? (process.env.GITHUB_ACTIONS === "true" ? "comment" : "terminal");

  if (options.dryRun) {
    console.log(`Diff source: ${source}`);
    console.log(`System prompt:\n\n${systemPrompt}`);
    console.log(`User prompt:\n\n${userPrompt}`);
    return;
  }

  let model;
  const modelStr = options.model ?? process.env.PI_REVIEWER_MODEL;
  if (modelStr) {
    const [provider, modelId] = modelStr.split("/");
    if (!provider || !modelId) {
      throw new Error(`Invalid model format "${modelStr}". Expected "provider/modelId" e.g. "anthropic/claude-opus-4-6"`);
    }
    model = getModel(provider as any, modelId as any);
  }

  const resolvedModel = model ?? getModel("anthropic", "claude-opus-4-6");
  console.log(`[pi-reviewer] running agent (model: ${resolvedModel.api})`);

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: resolvedModel,
      tools: createReadOnlyTools(cwd),
      thinkingLevel: "off",
    },
    getApiKey: async (provider) => {
      const key = provider === "anthropic"
        ? (options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY)
        : process.env[`${provider.toUpperCase()}_API_KEY`];
      if (!key) throw new Error(`No API key found for provider "${provider}"`);
      return key;
    },
  });

  let unsubscribe: (() => void) | undefined;

  try {
    let finalResponse = "";

    const ended = new Promise<void>((resolve, reject) => {
      unsubscribe = agent.subscribe((event: unknown) => {
        if (!event || typeof event !== "object") return;
        if ((event as { type?: string }).type !== "agent_end") return;

        const ev = event as { messages?: unknown; stopReason?: string; errorMessage?: string };

        if (ev.stopReason === "error") {
          const msg = ev.errorMessage ?? "Agent ended with an error (no message)";
          console.error(`[pi-reviewer] agent error: ${msg}`);
          reject(new Error(`Agent failed: ${msg}`));
          return;
        }

        finalResponse = extractAssistantText(ev.messages);

        if (!finalResponse.trim()) {
          console.error("[pi-reviewer] agent returned an empty response");
          reject(new Error("Agent returned an empty response"));
          return;
        }

        console.log(`[pi-reviewer] agent completed — response: ${finalResponse.length} chars`);
        resolve();
      });
    });

    await agent.prompt(userPrompt);
    await ended;

    await sendOutput({
      target,
      content: finalResponse,
      cwd,
      githubToken,
      prNumber: options.pr,
      repo,
      commitId: options.commitId,
      minSeverity: options.minSeverity as Severity | undefined,
    });
  } finally {
    unsubscribe?.();
  }
}
