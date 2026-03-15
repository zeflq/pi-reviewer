export const NOISE_PATTERNS = [
    /^pi-review\.md$/,
    /^package-lock\.json$/,
    /^yarn\.lock$/,
    /^pnpm-lock\.yaml$/,
    /^bun\.lockb$/,
    /^\.yarn\//,
    /^dist\//,
    /^build\//,
    /^\.next\//,
    /^out\//,
    /^coverage\//,
    /^node_modules\//,
    /\.min\.(js|css)$/,
    /\.generated\.(ts|js)$/,
    /\.d\.ts$/,
];
export const DEFAULT_MAX_CHARS = 100_000;
function isNoise(filePath) {
    return NOISE_PATTERNS.some((re) => re.test(filePath));
}
function parseFilePath(header) {
    const match = header.match(/^diff --git a\/.+ b\/(.+)$/);
    return match?.[1] ?? null;
}
export function filterDiff(raw, maxChars = DEFAULT_MAX_CHARS) {
    const sections = raw.split(/(?=^diff --git )/m).filter((s) => s.trim());
    const kept = [];
    const excluded = [];
    for (const section of sections) {
        const firstLine = section.split("\n")[0];
        const filePath = parseFilePath(firstLine);
        if (filePath && isNoise(filePath)) {
            excluded.push(filePath);
        }
        else {
            kept.push(section);
        }
    }
    const warnings = [];
    if (excluded.length > 0) {
        warnings.push(`${excluded.length} noise file${excluded.length > 1 ? "s" : ""} excluded (${excluded.join(", ")})`);
    }
    const included = [];
    const skippedFiles = [];
    let totalChars = 0;
    for (const section of kept) {
        if (totalChars + section.length > maxChars) {
            const firstLine = section.split("\n")[0];
            const filePath = parseFilePath(firstLine);
            skippedFiles.push(filePath ?? firstLine);
        }
        else {
            included.push(section);
            totalChars += section.length;
        }
    }
    if (skippedFiles.length > 0) {
        warnings.push(`${skippedFiles.length} file${skippedFiles.length > 1 ? "s" : ""} skipped — diff exceeded ${maxChars.toLocaleString()} chars (${skippedFiles.join(", ")})`);
    }
    return {
        diff: included.join(""),
        warning: warnings.length > 0 ? `⚠ ${warnings.join(" — ")}` : undefined,
        skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
    };
}
