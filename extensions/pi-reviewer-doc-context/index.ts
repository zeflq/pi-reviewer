import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_DOC_DIRS, loadDocContext } from "../../src/core/doc-context.js";
import type { FsOps } from "../../src/core/ssh.js";
import type { ContextFile } from "../../src/core/context.js";

// Re-export the shared scanning helpers so consumers/tests of this extension
// keep their existing import surface.
export { extractKeywords, parseDescription, isRelevant } from "../../src/core/doc-context.js";

const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";

const CONFIG_FILE = join(homedir(), ".pi", "pi-reviewer-doc-context", "config.json");

interface ContextProviderEvent {
  cwd: string;
  diffFiles: string[];
  register: (
    name: string,
    provider: (opts: { cwd: string; diffFiles: string[]; fs: FsOps; gitRoot?: string }) => Promise<ContextFile[]>,
  ) => void;
}

function readDocDirs(): string[] {
  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as { docDirs?: unknown };
    if (Array.isArray(config.docDirs) && config.docDirs.every((d) => typeof d === "string")) {
      return config.docDirs as string[];
    }
  } catch { /* ignore */ }
  return DEFAULT_DOC_DIRS;
}

export default function (pi: ExtensionAPI): void {
  pi.events.on(CONTEXT_PROVIDER_EVENT, (data: unknown) => {
    const { register } = data as ContextProviderEvent;
    register("doc-context", ({ cwd, diffFiles, fs, gitRoot }): Promise<ContextFile[]> =>
      loadDocContext({ cwd, diffFiles, fs, gitRoot, docDirs: readDocDirs() }),
    );
  });
}
