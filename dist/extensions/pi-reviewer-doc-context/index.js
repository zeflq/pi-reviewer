import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_DOC_DIRS, loadDocContext } from "../../src/core/doc-context.js";
// Re-export the shared scanning helpers so consumers/tests of this extension
// keep their existing import surface.
export { extractKeywords, parseDescription, isRelevant } from "../../src/core/doc-context.js";
const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";
const CONFIG_FILE = join(homedir(), ".pi", "pi-reviewer-doc-context", "config.json");
function readDocDirs() {
    try {
        const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        if (Array.isArray(config.docDirs) && config.docDirs.every((d) => typeof d === "string")) {
            return config.docDirs;
        }
    }
    catch { /* ignore */ }
    return DEFAULT_DOC_DIRS;
}
export default function (pi) {
    pi.events.on(CONTEXT_PROVIDER_EVENT, (data) => {
        const { register } = data;
        register("doc-context", ({ cwd, diffFiles, fs, gitRoot }) => loadDocContext({ cwd, diffFiles, fs, gitRoot, docDirs: readDocDirs() }));
    });
}
