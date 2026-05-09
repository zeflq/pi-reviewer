import path from "node:path";
import { collectProviderContext, loadContext } from "../../../src/core/context.js";
import { resolveDiff, extractDiffFiles } from "../../../src/core/diff-resolver.js";
import { buildJSONSystemPrompt, buildMarkdownSystemPrompt, buildSSHUserPrompt, buildUserPrompt } from "../../../src/core/prompt-builder.js";
import { readDefaultBranch } from "../../../src/core/ui/server/index.js";
import { buildSSHDiffCommand } from "../args.js";
export async function handleDryRun(opts) {
    const { parsed, cwd, pi, minSeverity, notify } = opts;
    if (parsed.ssh) {
        const drySSHContextFiles = (await collectProviderContext(pi.events, cwd, [])).flatMap(g => g.files);
        notify(`System prompt:\n\n${buildMarkdownSystemPrompt(minSeverity, undefined, drySSHContextFiles)}`);
        notify(`User prompt:\n\n${buildSSHUserPrompt(buildSSHDiffCommand(parsed))}`);
        return;
    }
    const { diff, source, skippedFiles } = await resolveDiff({
        cwd,
        diff: parsed.diff,
        branch: parsed.branch ?? readDefaultBranch(),
        pr: parsed.pr,
        dir: parsed.dir,
    });
    const context = await loadContext({
        cwd: parsed.dir ? path.resolve(cwd, parsed.dir) : cwd,
        gitRoot: parsed.dir ? cwd : undefined,
    });
    const dryDiffFiles = extractDiffFiles(diff);
    const dryContextFiles = (await collectProviderContext(pi.events, cwd, dryDiffFiles)).flatMap(g => g.files);
    notify(`Diff source: ${source}`);
    notify(`System prompt:\n\n${buildJSONSystemPrompt(context, minSeverity, dryContextFiles)}`);
    notify(`User prompt:\n\n${buildUserPrompt(diff, skippedFiles)}`);
}
