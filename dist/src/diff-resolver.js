import { execSync } from "node:child_process";
import { filterDiff } from "./diff-filter.js";
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
function mergeBaseDiff(base, cwd) {
    const mergeBase = run(`git merge-base ${base} HEAD`, cwd).trim();
    return run(`git diff ${mergeBase}`, cwd);
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
    let raw;
    let source;
    if (typeof options.pr === "number") {
        raw = run(`gh pr diff ${options.pr}`, cwd);
        source = `PR #${options.pr}`;
    }
    else if (options.diff) {
        raw = run(`git diff ${options.diff}`, cwd);
        source = `git diff ${options.diff}`;
    }
    else {
        const currentBranch = detectCurrentBranch(cwd);
        if (options.branch) {
            raw = mergeBaseDiff(options.branch, cwd);
            source = `${currentBranch} vs ${options.branch}`;
        }
        else if (process.env.GITHUB_ACTIONS === "true") {
            const baseRef = process.env.GITHUB_BASE_REF ?? "main";
            const base = `origin/${baseRef}`;
            raw = run(`git diff ${base}...HEAD`, cwd);
            source = `${currentBranch} vs ${base}`;
        }
        else {
            const base = detectOriginBase(cwd);
            raw = mergeBaseDiff(base, cwd);
            source = `${currentBranch} vs ${base}`;
        }
    }
    ensureNonEmptyDiff(raw);
    const { diff, warning, skippedFiles } = filterDiff(raw);
    return { diff, source, warning, skippedFiles };
}
