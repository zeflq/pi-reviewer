# pi-reviewer-doc-context

A pi extension that automatically injects relevant documentation from your project into the pi-reviewer system prompt, based on what files changed in the diff.

## How it works

At review time, the extension:

1. Extracts keywords from the diff file paths (e.g. `src/auth/login.ts` → `auth`, `login`)
2. Scans the configured doc dirs from the project root down to the working directory, one level of subdirectories deep, for `.md` files with a `description` frontmatter field
3. Loads any doc whose description or filename matches one of the keywords
4. Injects the matching docs into the system prompt alongside `AGENTS.md` / `REVIEW.md`

Works transparently in both local and SSH mode.

## Doc file format

Any `.md` file with a `description` frontmatter field is a candidate:

```markdown
---
description: Authentication flows, JWT tokens, session management
---

# Auth Guide

...content injected into the review prompt when auth-related files change...
```

The `description` line is matched against extracted diff keywords — keep it specific enough to avoid over-matching, but broad enough to cover the files it applies to.

## Configuration

The extension works out of the box with no config file. By default it scans `.pi/notes`, `.claude/notes`, and `.agents/notes` relative to each directory it walks.

To override the doc dirs, create `~/.pi/pi-reviewer-doc-context/config.json` manually:

| Field | Default | Description |
|---|---|---|
| `docDirs` | `[".pi/notes", ".claude/notes", ".agents/notes"]` | Directories to scan for doc files, relative to each scanned directory |

Each dir is scanned one level deep — files directly inside and files in immediate subdirectories are both picked up:

```
.pi/notes/
├── api.md                      ← scanned
└── backend/
    └── proxy-error-handling.md ← scanned (one level deep)
```

Example config:

```json
{
  "docDirs": [".pi/notes", "docs/review"]
}
```

### Monorepo and --dir

When `/review --dir packages/app` is used, the extension scans doc dirs at every level from the repo root down to the target directory. Paths are expressed relative to the working directory:

```
repo/
├── .pi/notes/shared.md         → ../../.pi/notes/shared.md  (from packages/app)
└── packages/
    ├── .pi/notes/common.md     → ../.pi/notes/common.md
    └── app/
        └── .pi/notes/local.md  → .pi/notes/local.md
```

All matched docs are included in the system prompt regardless of which level they come from.

---

## Context Provider API

pi-reviewer exposes a hook that lets any pi extension contribute additional context to the review agent's system prompt. `pi-reviewer-doc-context` is the built-in implementation — you can build your own alongside it.

### Event protocol

pi-reviewer emits `"pi-reviewer:collect-context-providers"` on `pi.events` when `/review` runs. Register a provider by calling `register(name, fn)` in the handler:

```typescript
pi.events.on("pi-reviewer:collect-context-providers", (data: unknown) => {
  const { cwd, diffFiles, register } = data as ContextProviderEvent;
  register("my-extension", async ({ cwd, diffFiles, fs, gitRoot }) => {
    if (!diffFiles.some(f => f.startsWith("src/api/"))) return [];
    const content = await fs.read(fs.join(cwd, "docs/api.md"));
    if (!content) return [];
    return [{ path: "docs/api.md", content }];
  });
});
```

### Types

```typescript
const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";

interface ContextFile {
  path: string;    // relative to cwd — shown in the UI Context tab
  content: string; // injected into the system prompt
}

// Passed to each provider at call time
type ContextProvider = (opts: {
  cwd: string;
  diffFiles: string[]; // file paths from diff --git headers
  fs: Fs;              // filesystem abstraction — works locally and over SSH
  gitRoot?: string;    // monorepo root; walk up from cwd to here when set (e.g. --dir is used)
}) => Promise<ContextFile[]>;

interface ContextProviderEvent {
  cwd: string;
  diffFiles: string[];
  register: (name: string, provider: ContextProvider) => void;
}

// Minimal filesystem interface — fs is provided by pi-reviewer
interface Fs {
  read: (path: string) => Promise<string | null>;
  list: (path: string) => Promise<string[]>;
  join: (...parts: string[]) => string;
  dirname: (path: string) => string;
}
```

### Filtering by diff files

Use `diffFiles` to load only what's relevant to the current diff:

```typescript
register("my-extension", async ({ cwd, diffFiles, fs }) => {
  if (!diffFiles.some(f => f.startsWith("packages/frontend/"))) return [];
  const content = await fs.read(fs.join(cwd, "packages/frontend/docs/components.md"));
  if (!content) return [];
  return [{ path: "packages/frontend/docs/components.md", content }];
});
```

Return `[]` to contribute nothing for this review.

### Monorepo walk-up

When `gitRoot` is provided, scan from the repo root down to `cwd` so docs at any level are included. Use `fs.dirname` to walk up from `cwd` to `gitRoot`:

```typescript
register("my-extension", async ({ cwd, diffFiles, fs, gitRoot }) => {
  const results: ContextFile[] = [];
  // Walk from gitRoot (or cwd when no gitRoot) down to cwd
  const dirs: string[] = [];
  let current = cwd;
  while (true) {
    dirs.unshift(current);
    if (!gitRoot || current === gitRoot) break;
    const parent = fs.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const dir of dirs) {
    const content = await fs.read(fs.join(dir, "docs/summary.md"));
    if (content) results.push({ path: fs.join(dir, "docs/summary.md"), content });
  }
  return results;
});
```

### SSH mode

In SSH mode `diffFiles` is always `[]` — the agent fetches the diff itself. Providers that return files unconditionally work normally; providers that filter strictly on `diffFiles` will contribute nothing.

The `fs` parameter is always the right filesystem for the current mode — local or SSH — so `fs.read` and `fs.list` work transparently without any SSH-specific code in your provider.

### Timing

The emit is **synchronous** — all handlers are called immediately and must call `register` synchronously. pi-reviewer then calls all collected providers in parallel via `Promise.all` before building the system prompt.

Register your listener at **extension load time** (inside the default export function) to ensure it is set up before `/review` runs.
