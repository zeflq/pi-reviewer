# Context Provider API

pi-reviewer exposes a hook that lets any pi extension contribute additional context to the review agent's system prompt.

## How it works

Providers return `ContextFile[]` — path + content pairs. pi-reviewer:
- Appends each `content` to the system prompt alongside `AGENTS.md` / `REVIEW.md`
- Uses each `path` for the notify message and the Context tab UI

`AGENTS.md` / `CLAUDE.md` and `REVIEW.md` are always loaded eagerly as before. Providers add supplementary context on top.

## Event protocol

pi-reviewer emits `"pi-reviewer:collect-context-providers"` on `pi.events` when `/review` runs. Register a provider by calling `register(name, fn)` in the handler:

```typescript
pi.events.on("pi-reviewer:collect-context-providers", ({ cwd, diffFiles, register }) => {
  register("my-extension", async ({ cwd, diffFiles }) => {
    // diffFiles: file paths changed in this diff (e.g. ["src/api/users.ts"])
    // Read and return only what's relevant
    return [
      { path: "docs/architecture.md", content: await fs.readFile(path.join(cwd, "docs/architecture.md"), "utf-8") },
    ];
  });
});
```

## Types

```typescript
export const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";

export interface ContextFile {
  path: string;    // relative to cwd — shown in notify + Context tab
  content: string; // injected into the system prompt
}

export type ContextProvider = (opts: {
  cwd: string;
  diffFiles: string[]; // file paths extracted from diff --git headers
}) => Promise<ContextFile[]>;

export interface ContextProviderEvent {
  cwd: string;
  diffFiles: string[];
  register: (name: string, provider: ContextProvider) => void;
}
```

## Filtering by diff files

Use `diffFiles` to avoid loading irrelevant context. Example — return frontend docs only if frontend files changed:

```typescript
register("my-extension", async ({ cwd, diffFiles }) => {
  if (!diffFiles.some(f => f.startsWith("packages/frontend/"))) return [];
  return [
    { path: "packages/frontend/docs/components.md", content: await fs.readFile(...) },
  ];
});
```

Return `[]` to contribute nothing for this review.

## Timing

Register your `pi.events.on` listener at **extension load time** (inside the extension's default export function). pi-reviewer emits the collect event at review time, firing all registered handlers synchronously — no load-order dependency.

## Context tab

The review UI groups loaded files by source:
- **Built-in**: `AGENTS.md`, `REVIEW.md`, markdown-linked files
- **your extension name**: files returned by your provider

The `name` passed to `register(name, provider)` becomes the group header in the Context tab.
