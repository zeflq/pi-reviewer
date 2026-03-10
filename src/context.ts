import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface ContextOptions {
  cwd?: string;
}

export interface ContextResult {
  conventions: string; // from AGENTS.md or CLAUDE.md
  reviewRules: string; // from REVIEW.md
  loadedFiles: string[]; // all files loaded (root + inlined links), relative to cwd
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function findFileCaseInsensitive(dir: string, name: string): Promise<string | null> {
  try {
    const entries = await readdir(dir);
    const match = entries.find((e) => e.toLowerCase() === name.toLowerCase());
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

async function resolveLinks(
  content: string,
  baseDir: string,
  visited: Set<string>,
  loaded: string[]
): Promise<string> {
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
    loaded.push(absPath);
    const resolved = await resolveLinks(linked, path.dirname(absPath), visited, loaded);
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
  const loaded: string[] = [];
  const visited = new Set<string>();

  let conventions = "";
  for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
    const absPath = await findFileCaseInsensitive(cwd, filename);
    if (absPath === null) continue;
    const content = await tryReadFile(absPath);
    if (content !== null) {
      visited.add(absPath);
      loaded.push(absPath);
      conventions = await resolveLinks(content, cwd, visited, loaded);
      break;
    }
  }

  const reviewAbsPath = await findFileCaseInsensitive(cwd, "REVIEW.md");
  let reviewRules = "";
  if (reviewAbsPath !== null) {
    const reviewRaw = await tryReadFile(reviewAbsPath);
    if (reviewRaw !== null) {
      visited.add(reviewAbsPath);
      loaded.push(reviewAbsPath);
      reviewRules = await resolveLinks(reviewRaw, cwd, visited, loaded);
    }
  }

  const loadedFiles = loaded.map((f) => path.relative(cwd, f));

  return { conventions, reviewRules, loadedFiles };
}
