import { collectProviderContext, mergeContextFiles } from "../../../src/core/context.js";
export const BUILT_IN_GROUP = "built-in";
export async function buildContextGroups(events, cwd, context, diffFiles, fs) {
    const providerGroups = await collectProviderContext(events, cwd, diffFiles, fs);
    const contextFiles = providerGroups.flatMap(g => g.files);
    const builtInFiles = mergeContextFiles(context);
    const contextPaths = [...builtInFiles.map(f => f.path), ...contextFiles.map(f => f.path)];
    const groups = [
        ...(builtInFiles.length > 0 ? [{ name: BUILT_IN_GROUP, files: builtInFiles }] : []),
        ...providerGroups,
    ];
    return { groups, contextFiles, contextPaths };
}
