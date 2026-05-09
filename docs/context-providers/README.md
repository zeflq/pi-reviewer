# Context Provider API

pi-reviewer exposes a hook that lets any pi extension contribute additional context to the review agent's system prompt.

## How it works

Providers return `ContextFile[]` — path + content pairs. pi-reviewer:
- Appends each `content` to the system prompt alongside `AGENTS.md` / `REVIEW.md`
- Uses each `path` in the `Provider context: …` notify message

`AGENTS.md` / `CLAUDE.md` and `REVIEW.md` are always loaded eagerly as before. Providers add supplementary context on top.

## Event protocol

pi-reviewer emits `"pi-reviewer:collect-context-providers"` on `pi.events` when `/review` runs. Register a provider by calling `register(name, fn)` in the handler:

```typescript
import type { ContextProviderEvent } from "pi-reviewer/src/core/context.js";

pi.events.on("pi-reviewer:collect-context-providers", (data) => {
  const { cwd, diffFiles, register } = data as ContextProviderEvent;
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
  path: string;    // relative to cwd — shown in notify message and Context tab (TODO #22)
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

Use `diffFiles` to avoid loading irrelevant context:

```typescript
pi.events.on("pi-reviewer:collect-context-providers", (data) => {
  const { register } = data as ContextProviderEvent;
  register("my-extension", async ({ cwd, diffFiles }) => {
    if (!diffFiles.some(f => f.startsWith("packages/frontend/"))) return [];
    return [
      { path: "packages/frontend/docs/components.md", content: await fs.readFile(...) },
    ];
  });
});
```

Return `[]` to contribute nothing for this review.

## SSH mode

In SSH mode the agent fetches the diff itself, so `diffFiles` is always `[]` when providers are called. Providers that filter by `diffFiles` will contribute nothing; providers that always return files work normally.

## Timing

The emit is **synchronous** — `pi.events.emit` calls all registered handlers immediately and returns. Each handler calls `register(name, provider)` synchronously to enqueue the provider. pi-reviewer then calls all collected providers in parallel with `Promise.all` and awaits their results before building the system prompt.

Register your `pi.events.on` listener at **extension load time** (inside the extension's default export function) to avoid missing the emit.

## Context tab (TODO #22)

The review UI will group loaded files by source:
- **Built-in**: `AGENTS.md`, `REVIEW.md`
- **your extension name**: files returned by your provider

The `name` passed to `register(name, provider)` will become the group header. This is not yet implemented.
