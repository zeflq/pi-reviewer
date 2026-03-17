import { createServer } from "node:http";
import { exec } from "node:child_process";
import { platform, homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildHTML } from "./template.js";
const CONFIG_DIR = join(homedir(), ".pi", "pi-reviewer");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
function readConfig() {
    try {
        return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
    catch {
        return {};
    }
}
function saveConfig(config) {
    try {
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    }
    catch { /* ignore */ }
}
export function readTheme() {
    return readConfig().theme ?? "dark";
}
// Resolve if no ping received for this long — user closed the tab
const HEARTBEAT_MS = 6000;
export async function startUIServer(result, diff, source, ssh) {
    const html = buildHTML(result, diff, source, ssh, readTheme());
    let resolveAction;
    const actionPromise = new Promise((r) => { resolveAction = r; });
    let heartbeatTimer;
    let resolved = false;
    function resolveOnce(action) {
        if (resolved)
            return;
        resolved = true;
        clearTimeout(heartbeatTimer);
        resolveAction(action);
    }
    function resetHeartbeat() {
        if (resolved)
            return;
        clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => resolveOnce({ type: "closed", decisions: [] }), HEARTBEAT_MS);
    }
    function readBody(req) {
        return new Promise((res) => {
            let body = "";
            req.on("data", (c) => { body += c; });
            req.on("end", () => res(body));
        });
    }
    const server = createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        }
        else if (req.method === "GET" && req.url === "/ping") {
            resetHeartbeat();
            res.writeHead(204);
            res.end();
        }
        else if (req.method === "POST" && req.url === "/theme") {
            const body = await readBody(req);
            try {
                const { theme } = JSON.parse(body);
                if (theme === "dark" || theme === "light")
                    saveConfig({ ...readConfig(), theme });
            }
            catch { /* ignore */ }
            res.writeHead(204);
            res.end();
        }
        else if (req.method === "POST" && req.url === "/action") {
            const body = await readBody(req);
            try {
                const action = JSON.parse(body);
                res.writeHead(200);
                res.end();
                resolveOnce(action);
            }
            catch {
                res.writeHead(400);
                res.end();
            }
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    const port = await listenOnRandomPort(server);
    const url = "http://localhost:" + port;
    openBrowser(url);
    return {
        url,
        waitForAction: () => actionPromise,
        close: () => new Promise((resolve, reject) => {
            clearTimeout(heartbeatTimer);
            server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
}
export function listenOnRandomPort(server) {
    return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
                reject(new Error("Unexpected server address"));
                return;
            }
            resolve(addr.port);
        });
        server.on("error", reject);
    });
}
export function openBrowser(url) {
    const p = platform();
    if (p === "darwin")
        exec("open " + url);
    else if (p === "win32")
        exec('start "" "' + url + '"');
    else
        exec("xdg-open " + url);
}
