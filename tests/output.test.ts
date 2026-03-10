import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAgentResponse, sendOutput } from "../src/output.js";

const createdDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-reviewer-output-"));
  createdDirs.push(dir);
  return dir;
}

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: vi.fn().mockResolvedValue(""),
  });
}

describe("parseAgentResponse", () => {
  it("returns parsed ReviewResult for valid JSON", () => {
    const result = parseAgentResponse(
      JSON.stringify({
        summary: "Overall review",
        comments: [
          { file: "src/a.ts", line: 10, side: "RIGHT", severity: "WARN", body: "Nice improvement" },
        ],
      })
    );

    expect(result).toEqual({
      summary: "Overall review",
      comments: [
        { file: "src/a.ts", line: 10, side: "RIGHT", severity: "WARN", body: "🟡 Nice improvement" },
      ],
    });
  });

  it("falls back for invalid JSON", () => {
    const result = parseAgentResponse("not-json");

    expect(result).toEqual({ summary: "not-json", comments: [] });
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const json = JSON.stringify({ summary: "looks good", comments: [] });
    const result = parseAgentResponse("```json\n" + json + "\n```");
    expect(result).toEqual({ summary: "looks good", comments: [] });
  });

  it("parses JSON wrapped in plain code fences", () => {
    const json = JSON.stringify({ summary: "looks good", comments: [] });
    const result = parseAgentResponse("```\n" + json + "\n```");
    expect(result).toEqual({ summary: "looks good", comments: [] });
  });

  it("parses JSON when agent adds preamble text before the fence", () => {
    const json = JSON.stringify({ summary: "looks good", comments: [] });
    const result = parseAgentResponse("Here is my review:\n\n```json\n" + json + "\n```");
    expect(result).toEqual({ summary: "looks good", comments: [] });
  });

  it("parses JSON when agent adds preamble and no fence", () => {
    const json = JSON.stringify({ summary: "looks good", comments: [] });
    const result = parseAgentResponse("Here is my review:\n\n" + json);
    expect(result).toEqual({ summary: "looks good", comments: [] });
  });

  it("falls back when JSON is missing required fields", () => {
    const result = parseAgentResponse(JSON.stringify({ summary: "Only summary" }));

    expect(result).toEqual({
      summary: JSON.stringify({ summary: "Only summary" }),
      comments: [],
    });
  });

  it("normalizes missing severity to INFO", () => {
    const result = parseAgentResponse(
      JSON.stringify({
        summary: "review",
        comments: [{ file: "src/a.ts", line: 1, side: "RIGHT", body: "comment" }],
      })
    );
    expect(result.comments[0].severity).toBe("INFO");
  });

  it("filters out comments below minSeverity", () => {
    const result = parseAgentResponse(
      JSON.stringify({
        summary: "review",
        comments: [
          { file: "src/a.ts", line: 1, side: "RIGHT", severity: "INFO", body: "style" },
          { file: "src/b.ts", line: 2, side: "RIGHT", severity: "WARN", body: "logic issue" },
          { file: "src/c.ts", line: 3, side: "RIGHT", severity: "CRITICAL", body: "crash" },
        ],
      }),
      "WARN"
    );
    expect(result.comments).toHaveLength(2);
    expect(result.comments.map((c) => c.severity)).toEqual(["WARN", "CRITICAL"]);
  });

  it("keeps only CRITICAL when minSeverity is CRITICAL", () => {
    const result = parseAgentResponse(
      JSON.stringify({
        summary: "review",
        comments: [
          { file: "src/a.ts", line: 1, side: "RIGHT", severity: "INFO", body: "style" },
          { file: "src/b.ts", line: 2, side: "RIGHT", severity: "WARN", body: "logic" },
          { file: "src/c.ts", line: 3, side: "RIGHT", severity: "CRITICAL", body: "crash" },
        ],
      }),
      "CRITICAL"
    );
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].severity).toBe("CRITICAL");
  });
});

describe("sendOutput", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("logs formatted content to console for terminal target", async () => {
    await sendOutput({ target: "terminal", content: "hello review" });

    expect(logSpy).toHaveBeenCalledWith("== Review Summary ==\nhello review");
  });

  it("posts to Issues API when no commitId is provided", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await sendOutput({
      target: "comment",
      content: "LGTM",
      githubToken: "token123",
      prNumber: 42,
      repo: "owner/repo",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/issues/42/comments",
      expect.objectContaining({
        body: expect.stringContaining("LGTM"),
      })
    );
  });

  it("posts to Reviews API with inline comments when commitId is provided", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await sendOutput({
      target: "comment",
      content: JSON.stringify({
        summary: "Needs fixes",
        comments: [
          { file: "src/auth.ts", line: 42, side: "RIGHT", severity: "CRITICAL", body: "Missing null check" },
        ],
      }),
      githubToken: "token123",
      prNumber: 42,
      repo: "owner/repo",
      commitId: "abc123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/pulls/42/reviews",
      expect.objectContaining({
        body: JSON.stringify({
          commit_id: "abc123",
          body: "Needs fixes",
          event: "COMMENT",
          comments: [
            { path: "src/auth.ts", line: 42, side: "RIGHT", body: "🔴 Missing null check" },
          ],
        }),
      })
    );
  });

  it("falls back to Issues API when Reviews API returns 422", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 422, statusText: "Unprocessable Entity", text: vi.fn().mockResolvedValue("") })
      .mockResolvedValueOnce({ ok: true, text: vi.fn().mockResolvedValue("") });
    vi.stubGlobal("fetch", fetchMock);

    await sendOutput({
      target: "comment",
      content: JSON.stringify({
        summary: "Needs fixes",
        comments: [{ file: "src/auth.ts", line: 42, side: "RIGHT", severity: "WARN", body: "Missing null check" }],
      }),
      githubToken: "token123",
      prNumber: 42,
      repo: "owner/repo",
      commitId: "abc123",
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("posting summary only"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/owner/repo/issues/42/comments"
    );
  });

  it("uses Issues API with summary only when content has no inline comments", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await sendOutput({
      target: "comment",
      content: "Looks mostly good",
      githubToken: "token123",
      prNumber: 42,
      repo: "owner/repo",
      commitId: "abc123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/issues/42/comments",
      expect.objectContaining({
        body: expect.stringContaining("Looks mostly good"),
      })
    );
  });

  it("throws when githubToken is missing", async () => {
    await expect(
      sendOutput({
        target: "comment",
        content: "text",
        prNumber: 1,
        repo: "owner/repo",
      })
    ).rejects.toThrow("GITHUB_TOKEN is required to post a comment");
  });

  it("throws when prNumber is missing", async () => {
    await expect(
      sendOutput({
        target: "comment",
        content: "text",
        githubToken: "token",
        repo: "owner/repo",
      })
    ).rejects.toThrow("PR number is required to post a comment");
  });

  it("throws when repo is missing", async () => {
    await expect(
      sendOutput({
        target: "comment",
        content: "text",
        githubToken: "token",
        prNumber: 1,
      })
    ).rejects.toThrow("Repository (owner/repo) is required to post a comment");
  });

  it("throws when fetch response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: vi.fn().mockResolvedValue("Forbidden"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendOutput({
        target: "comment",
        content: "text",
        githubToken: "token",
        prNumber: 1,
        repo: "owner/repo",
      })
    ).rejects.toThrow("Failed to post GitHub comment: 403 Forbidden");
  });

  it("writes formatted review to pi-review.md for file target", async () => {
    const dir = await createTempDir();

    await sendOutput({
      target: "file",
      content: JSON.stringify({
        summary: "Please address comments",
        comments: [
          { file: "src/a.ts", line: 7, side: "RIGHT", severity: "WARN", body: "Handle undefined" },
        ],
      }),
      cwd: dir,
    });

    const content = await readFile(path.join(dir, "pi-review.md"), "utf-8");
    expect(content).toBe(
      "== Review Summary ==\nPlease address comments\n\n== Inline Comments ==\n🟡 src/a.ts:7 (RIGHT)\n🟡 Handle undefined"
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("pi-review.md"));
  });

  it("filters comments by minSeverity when posting", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await sendOutput({
      target: "comment",
      content: JSON.stringify({
        summary: "review",
        comments: [
          { file: "src/a.ts", line: 1, side: "RIGHT", severity: "INFO", body: "style" },
          { file: "src/b.ts", line: 2, side: "RIGHT", severity: "CRITICAL", body: "crash" },
        ],
      }),
      githubToken: "token123",
      prNumber: 1,
      repo: "owner/repo",
      commitId: "abc123",
      minSeverity: "CRITICAL",
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].path).toBe("src/b.ts");
  });
});
