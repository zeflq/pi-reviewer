import { collectProviderContext, mergeContextFiles, type ContextGroup, type ContextFile, type ContextResult, type MinimalEventBus } from "../../../src/core/context.js";
import type { FsOps } from "../../../src/core/ssh.js";

export const BUILT_IN_GROUP = "built-in";

export interface ContextGroupsResult {
  groups: ContextGroup[];
  contextFiles: ContextFile[];
  contextPaths: string[];
}

export async function buildContextGroups(
  events: MinimalEventBus,
  cwd: string,
  context: ContextResult,
  diffFiles: string[],
  fs?: FsOps,
  gitRoot?: string,
): Promise<ContextGroupsResult> {
  const providerGroups = await collectProviderContext(events, cwd, diffFiles, fs, gitRoot);
  const contextFiles = providerGroups.flatMap(g => g.files);
  const builtInFiles = mergeContextFiles(context);
  const contextPaths = [...builtInFiles.map(f => f.path), ...contextFiles.map(f => f.path)];
  const groups: ContextGroup[] = [
    ...(builtInFiles.length > 0 ? [{ name: BUILT_IN_GROUP, files: builtInFiles }] : []),
    ...providerGroups,
  ];
  return { groups, contextFiles, contextPaths };
}
