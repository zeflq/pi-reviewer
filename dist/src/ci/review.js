import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { createReadOnlyTools } from "@mariozechner/pi-coding-agent";
import { loadContext, mergeContextFiles } from "../core/context.js";
import { resolveDiff, extractDiffFiles } from "../core/diff-resolver.js";
import { loadDocContext } from "../core/doc-context.js";
import { sendOutput, extractLastAssistantText } from "../core/output.js";
import { buildJSONSystemPrompt, buildUserPrompt } from "../core/prompt-builder.js";
/** Parses a comma/newline-separated doc-dirs string into a trimmed, non-empty list. */
export function parseDocDirs(raw) {
    if (!raw)
        return [];
    return raw.split(/[,\n]/).map(d => d.trim()).filter(Boolean);
}
export async function review(options) {
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
    if (warning)
        console.warn(`[pi-reviewer] ${warning}`);
    const context = await loadContext({ cwd });
    const loadedPaths = mergeContextFiles(context).map(f => f.path);
    if (loadedPaths.length > 0) {
        console.log(`[pi-reviewer] context loaded: ${loadedPaths.join(", ")}`);
    }
    else {
        console.log("[pi-reviewer] context: no conventions found (AGENTS.md / CLAUDE.md / REVIEW.md)");
    }
    const docDirs = options.docDirs ?? parseDocDirs(process.env.PI_REVIEWER_DOC_DIRS);
    const docContextFiles = docDirs.length > 0
        ? await loadDocContext({ cwd, diffFiles: extractDiffFiles(diff), docDirs })
        : [];
    if (docContextFiles.length > 0) {
        console.log(`[pi-reviewer] doc-context loaded: ${docContextFiles.map(f => f.path).join(", ")}`);
    }
    const systemPrompt = buildJSONSystemPrompt(context, options.minSeverity, docContextFiles);
    const userPrompt = buildUserPrompt(diff, skippedFiles);
    const target = options.output ?? (process.env.GITHUB_ACTIONS === "true" ? "comment" : "terminal");
    if (options.dryRun) {
        console.log(`Diff source: ${source}`);
        console.log(`System prompt:\n\n${systemPrompt}`);
        console.log(`User prompt:\n\n${userPrompt}`);
        return;
    }
    const modelStr = options.model ?? process.env.PI_REVIEWER_MODEL;
    if (!modelStr) {
        throw new Error(`No model configured. Set the "model" action input (or PI_REVIEWER_MODEL) to a "provider/modelId" — e.g. "openrouter/openai/gpt-5.4-mini".`);
    }
    // Split on the FIRST slash so OpenRouter ids that contain slashes survive
    // (e.g. "openrouter/openai/gpt-5.4-mini" → provider "openrouter", id "openai/gpt-5.4-mini").
    const slash = modelStr.indexOf("/");
    if (slash <= 0 || slash === modelStr.length - 1) {
        throw new Error(`Invalid model format "${modelStr}". Expected "provider/modelId" — e.g. "anthropic/claude-opus-4-6" or "openrouter/openai/gpt-5.4-mini"`);
    }
    const provider = modelStr.slice(0, slash);
    const modelId = modelStr.slice(slash + 1);
    const resolvedModel = getModel(provider, modelId);
    if (!resolvedModel) {
        throw new Error(`Unknown model "${modelStr}" — not found in the pi model registry.`);
    }
    console.log(`[pi-reviewer] running agent (model: ${resolvedModel.api})`);
    const agent = new Agent({
        initialState: {
            systemPrompt,
            model: resolvedModel,
            tools: createReadOnlyTools(cwd),
            thinkingLevel: "off",
        },
        getApiKey: async () => {
            const key = options.piApiKey ?? process.env.PI_API_KEY;
            if (!key)
                throw new Error("PI_API_KEY is not set.");
            return key;
        },
    });
    let unsubscribe;
    try {
        let finalResponse = "";
        const ended = new Promise((resolve, reject) => {
            unsubscribe = agent.subscribe((event) => {
                if (!event || typeof event !== "object")
                    return;
                if (event.type !== "agent_end")
                    return;
                const ev = event;
                if (ev.stopReason === "error") {
                    const msg = ev.errorMessage ?? "Agent ended with an error (no message)";
                    console.error(`[pi-reviewer] agent error: ${msg}`);
                    reject(new Error(`Agent failed: ${msg}`));
                    return;
                }
                finalResponse = extractLastAssistantText(ev.messages);
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
            minSeverity: options.minSeverity,
        });
    }
    finally {
        unsubscribe?.();
    }
}
