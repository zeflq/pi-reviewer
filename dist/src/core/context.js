import { execSync } from "node:child_process";
import { localFs, sshExec, sshFs } from "./ssh.js";
const CONFIG_DIRS = [".pi", ".claude", ".agents"];
export const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";
function findGitRoot(cwd) {
    try {
        return execSync("git rev-parse --show-toplevel", {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    }
    catch {
        return null;
    }
}
async function readContextFile(fs, dir, filename) {
    for (const candidate of [dir, ...CONFIG_DIRS.map(d => fs.join(dir, d))]) {
        const entries = await fs.list(candidate);
        const match = entries.find(e => e.toLowerCase() === filename.toLowerCase());
        if (!match)
            continue;
        const filePath = fs.join(candidate, match);
        const content = await fs.read(filePath);
        if (content !== null)
            return { path: filePath, content };
    }
    return null;
}
/**
 * Walks from gitRoot down to cwd, collecting one matching file per directory level.
 * filenames: tried in priority order at each level (first match wins).
 * Returns files in root → cwd order.
 */
export async function walkUpContextFiles(fs, cwd, filenames, gitRoot) {
    const dirs = [];
    let current = cwd;
    while (true) {
        dirs.unshift(current);
        if (current === gitRoot)
            break;
        const parent = fs.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    const result = [];
    const visited = new Set();
    for (const dir of dirs) {
        for (const filename of filenames) {
            const file = await readContextFile(fs, dir, filename);
            if (file === null || visited.has(file.path))
                continue;
            visited.add(file.path);
            result.push({ path: fs.relative(cwd, file.path), content: file.content });
            break; // one file per directory level
        }
    }
    return result;
}
/** Merges conventions and reviewRules into a single ordered array. */
export function mergeContextFiles(result) {
    return [...result.conventions, ...result.reviewRules];
}
export async function collectProviderContext(events, cwd, diffFiles) {
    const registrations = [];
    events.emit(CONTEXT_PROVIDER_EVENT, {
        cwd,
        diffFiles,
        register: (name, provider) => registrations.push({ name, provider }),
    });
    return (await Promise.all(registrations.map(({ provider }) => provider({ cwd, diffFiles })))).flat();
}
export async function loadContext(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const gitRoot = options.gitRoot ?? findGitRoot(cwd) ?? cwd;
    const fs = localFs();
    const [conventions, reviewRules] = await Promise.all([
        walkUpContextFiles(fs, cwd, ["AGENTS.md", "CLAUDE.md"], gitRoot),
        walkUpContextFiles(fs, cwd, ["REVIEW.md"], gitRoot),
    ]);
    return { conventions, reviewRules };
}
export async function loadContextSSH(remote, remoteCwd, gitRoot) {
    const fs = sshFs(remote);
    const resolvedGitRoot = gitRoot ?? await sshExec(remote, `git -C ${JSON.stringify(remoteCwd)} rev-parse --show-toplevel`)
        .then(out => out.trim())
        .catch(() => remoteCwd);
    const [conventions, reviewRules] = await Promise.all([
        walkUpContextFiles(fs, remoteCwd, ["AGENTS.md", "CLAUDE.md"], resolvedGitRoot),
        walkUpContextFiles(fs, remoteCwd, ["REVIEW.md"], resolvedGitRoot),
    ]);
    return { conventions, reviewRules };
}
