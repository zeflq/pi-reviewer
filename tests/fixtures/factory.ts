import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TempProject {
  dir: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a temp directory pre-populated with the given files.
 *
 * `files` maps relative paths → content:
 *   { ".pi/AGENTS.md": "# Conventions", "packages/api/REVIEW.md": "# Rules" }
 *
 * Pass `{ git: true }` to initialise a bare git repo at `dir` so that
 * `loadContext` can walk up to it as the git root for monorepo scenarios.
 */
export async function createTempProject(
  files: Record<string, string> = {},
  { git = false }: { git?: boolean } = {},
): Promise<TempProject> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-reviewer-integ-"));

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(dir, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf-8");
  }

  if (git) {
    execSync("git init", { cwd: dir, stdio: "ignore" });
  }

  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
