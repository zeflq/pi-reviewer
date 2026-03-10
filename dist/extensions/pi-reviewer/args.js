export function parseArgs(rawArgs) {
    const tokens = rawArgs.trim() ? rawArgs.trim().split(/\s+/) : [];
    const parsed = { dryRun: false, ssh: false, minSeverity: "INFO" };
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
        throw new Error(`Unknown argument: ${token}`);
    }
    return parsed;
}
