export function buildSSHOriginBaseCommand(g) {
    return `${g} symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null || { ${g} show-ref --verify --quiet refs/remotes/origin/main 2>/dev/null && echo origin/main || echo origin/master; }`;
}
export function buildSSHDiffCommand(parsed, opts = {}) {
    const g = opts.remoteCwd ? `git -C ${JSON.stringify(opts.remoteCwd)}` : "git";
    if (typeof parsed.pr === "number")
        return `gh pr diff ${parsed.pr}`;
    if (parsed.diff)
        return `${g} diff ${parsed.diff}`;
    const branch = parsed.branch ?? opts.branch;
    const detectBase = branch
        ? `$(${g} merge-base ${branch} HEAD)`
        : `$(${g} merge-base $(${buildSSHOriginBaseCommand(g)}) HEAD)`;
    // Mirror local withUntrackedFiles: temporarily stage untracked files so they appear in the diff
    return `_u=$(${g} ls-files --others --exclude-standard); [ -n "$_u" ] && ${g} add -N -- $_u 2>/dev/null; ${g} diff ${detectBase}; [ -n "$_u" ] && ${g} rm -r --cached --ignore-unmatch -- $_u 2>/dev/null; true`;
}
export function parseArgs(rawArgs) {
    const tokens = rawArgs.trim() ? rawArgs.trim().split(/\s+/) : [];
    const parsed = { dryRun: false, ssh: false, ui: false };
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === "--dry-run") {
            parsed.dryRun = true;
            continue;
        }
        if (token === "--ssh") {
            parsed.ssh = true;
            continue;
        }
        if (token === "--ui") {
            parsed.ui = true;
            continue;
        }
        if (token === "--verbose") {
            parsed.verbose = true;
            continue;
        }
        if (token === "--model") {
            const value = tokens[i + 1];
            if (!value)
                throw new Error("Missing value for --model");
            parsed.model = value;
            i += 1;
            continue;
        }
        if (token === "--thinking") {
            const value = tokens[i + 1];
            if (!value)
                throw new Error("Missing value for --thinking");
            const valid = ["off", "minimal", "low", "medium", "high", "xhigh"];
            if (!valid.includes(value))
                throw new Error(`Invalid thinking level: ${value}. Expected: ${valid.join(", ")}`);
            parsed.thinking = value;
            i += 1;
            continue;
        }
        if (token === "--diff") {
            const value = tokens[i + 1];
            if (!value)
                throw new Error("Missing value for --diff");
            parsed.diff = value;
            i += 1;
            continue;
        }
        if (token === "--branch") {
            const value = tokens[i + 1];
            if (!value)
                throw new Error("Missing value for --branch");
            parsed.branch = value;
            i += 1;
            continue;
        }
        if (token === "--min-severity") {
            const value = tokens[i + 1]?.toUpperCase();
            if (!value)
                throw new Error("Missing value for --min-severity");
            if (value !== "INFO" && value !== "WARN" && value !== "CRITICAL") {
                throw new Error(`Invalid severity: ${tokens[i + 1]}. Expected info, warn, or critical`);
            }
            parsed.minSeverity = value;
            i += 1;
            continue;
        }
        if (token === "--pr") {
            const value = tokens[i + 1];
            if (!value)
                throw new Error("Missing value for --pr");
            const pr = Number.parseInt(value, 10);
            if (Number.isNaN(pr))
                throw new Error(`Invalid PR number: ${value}`);
            parsed.pr = pr;
            i += 1;
            continue;
        }
        if (token === "--dir") {
            const value = tokens[i + 1];
            if (!value)
                throw new Error("Missing value for --dir");
            parsed.dir = value;
            i += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${token}`);
    }
    return parsed;
}
