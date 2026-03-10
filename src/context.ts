import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ContextOptions {
  cwd?: string;
}

export interface ContextResult {
  conventions: string; // from AGENTS.md or CLAUDE.md
  reviewRules: string; // from REVIEW.md
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function resolveLinks(content: string, baseDir: string, visited = new Set<string>()): Promise<string> {
  const linkPattern = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
  const replacements: Array<{ match: string; replacement: string }> = [];

  for (const match of content.matchAll(linkPattern)) {
    const [full, , href] = match;
    if (href.startsWith("http")) continue;

    const absPath = path.resolve(baseDir, href);
    if (visited.has(absPath)) continue;

    const linked = await tryReadFile(absPath);
    if (linked === null) continue;

    visited.add(absPath);
    const resolved = await resolveLinks(linked, path.dirname(absPath), visited);
    replacements.push({ match: full, replacement: resolved.trim() });
  }

  let result = content;
  for (const { match, replacement } of replacements) {
    result = result.replace(match, replacement);
  }
  return result;
}

export async function loadContext(options: ContextOptions = {}): Promise<ContextResult> {
  const cwd = options.cwd ?? process.cwd();

  let conventions = "";
  for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
    const content = await tryReadFile(path.join(cwd, filename));
    if (content !== null) {
      conventions = await resolveLinks(content, cwd);
      break;
    }
  }

  const reviewRaw = await tryReadFile(path.join(cwd, "REVIEW.md"));
  const reviewRules = reviewRaw !== null ? await resolveLinks(reviewRaw, cwd) : "";

  return { conventions, reviewRules };
}
