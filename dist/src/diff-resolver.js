import { execSync } from "node:child_process";
const EMPTY_DIFF_ERROR = "No changes found. Make sure you are on a feature branch with commits ahead of the base.";
function run(command, cwd) {
    return execSync(command, { cwd, encoding: "utf-8" });
}
function ensureNonEmptyDiff(diff) {
    if (diff.trim().length === 0) {
        throw new Error(EMPTY_DIFF_ERROR);
    }
}
function detectCurrentBranch(cwd) {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", {
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    }
    catch {
        return "HEAD";
    }
}
function detectOriginBase(cwd) {
    try {
        return execSync("git symbolic-ref refs/remotes/origin/HEAD --short", {
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    }
    catch {
        return "origin/main";
    }
}
export async function resolveDiff(options) {
    const cwd = options.cwd ?? process.cwd();
    if (typeof options.pr === "number") {
        const diff = run(`gh pr diff ${options.pr}`, cwd);
        ensureNonEmptyDiff(diff);
        return { diff, source: `PR #${options.pr}` };
    }
    if (options.diff) {
        const diff = run(`git diff ${options.diff}`, cwd);
        ensureNonEmptyDiff(diff);
        return { diff, source: `git diff ${options.diff}` };
    }
    const currentBranch = detectCurrentBranch(cwd);
    if (options.branch) {
        const range = `${options.branch}...${currentBranch}`;
        const diff = run(`git diff ${options.branch}...HEAD`, cwd);
        ensureNonEmptyDiff(diff);
        return { diff, source: `git diff ${range}` };
    }
    if (process.env.GITHUB_ACTIONS === "true") {
        const baseRef = process.env.GITHUB_BASE_REF ?? "main";
        const range = `origin/${baseRef}...${currentBranch}`;
        const diff = run(`git diff origin/${baseRef}...HEAD`, cwd);
        ensureNonEmptyDiff(diff);
        return { diff, source: `git diff ${range}` };
    }
    const base = detectOriginBase(cwd);
    const range = `${base}...${currentBranch}`;
    const diff = run(`git diff ${base}...HEAD`, cwd);
    ensureNonEmptyDiff(diff);
    return { diff, source: `git diff ${range}` };
}
