import type { ContextGroup, ContextFile } from "./types";

export function countContextFiles(groups: ContextGroup[]): number {
  return groups.reduce((n, g) => n + g.files.length, 0);
}

export function flattenContextFiles(
  groups: ContextGroup[],
): Array<ContextFile & { group: string }> {
  return groups.flatMap(g => g.files.map(f => ({ ...f, group: g.name })));
}
