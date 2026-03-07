export const NOISE_PATTERNS: RegExp[] = [
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

export interface FilterResult {
  diff: string;
  warning?: string;
}

function isNoise(filePath: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(filePath));
}

function parseFilePath(header: string): string | null {
  const match = header.match(/^diff --git a\/.+ b\/(.+)$/);
  return match?.[1] ?? null;
}

export function filterDiff(raw: string, maxChars = DEFAULT_MAX_CHARS): FilterResult {
  const sections = raw.split(/(?=^diff --git )/m).filter((s) => s.trim());

  const kept: string[] = [];
  const excluded: string[] = [];

  for (const section of sections) {
    const firstLine = section.split("\n")[0];
    const filePath = parseFilePath(firstLine);
    if (filePath && isNoise(filePath)) {
      excluded.push(filePath);
    } else {
      kept.push(section);
    }
  }

  let diff = kept.join("");
  const warnings: string[] = [];

  if (excluded.length > 0) {
    warnings.push(`${excluded.length} noise file${excluded.length > 1 ? "s" : ""} excluded (${excluded.join(", ")})`);
  }

  if (diff.length > maxChars) {
    diff = diff.slice(0, maxChars);
    warnings.push(`diff truncated at ${maxChars.toLocaleString()} chars`);
  }

  return {
    diff,
    warning: warnings.length > 0 ? `⚠ ${warnings.join(" — ")}` : undefined,
  };
}
