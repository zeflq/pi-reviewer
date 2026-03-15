import http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { buildHTML } from "../../../src/core/ui/template.js";
import { startUIServer, openBrowser } from "../../../src/core/ui/server.js";
const RESULT = {
    summary: "Looks good overall.",
    comments: [
        { file: "src/foo.ts", line: 10, side: "RIGHT", severity: "WARN", body: "🟡 use const" },
        { file: "src/foo.ts", line: 4, side: "LEFT", severity: "INFO", body: "🔵 removed import" },
    ],
};
const DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -3,6 +3,6 @@
 const a = 1;
-import { old } from "./old.js";
 const b = 2;
+let c = 3;
`;
// ── buildHTML ────────────────────────────────────────────────────────────────
describe("buildHTML", () => {
    it("returns a complete HTML document", () => {
        const html = buildHTML(RESULT, DIFF);
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("</html>");
    });
    it("embeds the summary in the page", () => {
        const html = buildHTML(RESULT, DIFF);
        expect(html).toContain("Looks good overall.");
    });
    it("embeds comment body text", () => {
        const html = buildHTML(RESULT, DIFF);
        expect(html).toContain("use const");
    });
    it("escapes HTML-unsafe chars in JSON payload", () => {
        const xss = { summary: "<script>alert(1)</script>", comments: [] };
        const html = buildHTML(xss, "");
        expect(html).not.toContain("<script>alert");
        expect(html).toContain("\\u003cscript");
    });
    it("embeds the diff string", () => {
        const html = buildHTML(RESULT, DIFF);
        expect(html).toContain("src/foo.ts");
    });
});
// ── startUIServer ────────────────────────────────────────────────────────────
function get(url) {
    return new Promise((resolve, reject) => {
        http
            .get(url, (res) => {
            let body = "";
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        })
            .on("error", reject);
    });
}
function post(url, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (res) => {
            res.resume();
            res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        });
        req.on("error", reject);
        req.end(payload);
    });
}
describe("startUIServer", () => {
    // Prevent actual browser from opening during tests
    vi.spyOn({ openBrowser }, "openBrowser").mockImplementation(() => { });
    it("starts a server and returns a localhost URL", async () => {
        const handle = await startUIServer(RESULT, DIFF);
        expect(handle.url).toMatch(/^http:\/\/localhost:\d+$/);
        await handle.close();
    });
    it("serves the HTML page on GET /", async () => {
        const handle = await startUIServer(RESULT, DIFF);
        const { status, body } = await get(handle.url);
        expect(status).toBe(200);
        expect(body).toContain("Pi Review");
        expect(body).toContain("Looks good overall.");
        await handle.close();
    });
    it("responds on a port different from the previous instance", async () => {
        const a = await startUIServer(RESULT, DIFF);
        const b = await startUIServer(RESULT, DIFF);
        expect(a.url).not.toBe(b.url);
        await Promise.all([a.close(), b.close()]);
    });
    it("close() shuts the server down so subsequent requests fail", async () => {
        const handle = await startUIServer(RESULT, DIFF);
        await handle.close();
        await expect(get(handle.url)).rejects.toThrow();
    });
    it("GET /ping returns 204", async () => {
        const handle = await startUIServer(RESULT, DIFF);
        const { status } = await get(handle.url + "/ping");
        expect(status).toBe(204);
        await handle.close();
    });
    it("POST /action resolves waitForAction with the payload", async () => {
        const handle = await startUIServer(RESULT, DIFF);
        const payload = {
            type: "save",
            decisions: [{ index: 0, decision: "accept" }, { index: 1, decision: "reject" }],
        };
        await post(handle.url + "/action", payload);
        const action = await handle.waitForAction();
        expect(action.type).toBe("save");
        expect(action.decisions).toHaveLength(2);
        await handle.close();
    });
    it("POST /action with invalid JSON returns 400", async () => {
        const handle = await startUIServer(RESULT, DIFF);
        const { status } = await new Promise((resolve, reject) => {
            const req = http.request(handle.url + "/action", { method: "POST" }, (res) => {
                res.resume();
                res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
            });
            req.on("error", reject);
            req.end("not-json");
        });
        expect(status).toBe(400);
        await handle.close();
    });
});
