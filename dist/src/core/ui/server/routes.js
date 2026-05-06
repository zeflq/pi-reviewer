import { readConfig, saveConfig } from "./config.js";
const VALID_THINKING = ["off", "minimal", "low", "medium", "high", "xhigh"];
const VALID_SEVERITY = ["INFO", "WARN", "CRITICAL"];
function readBody(req) {
    return new Promise((res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => res(body));
    });
}
function applyConfigPatch(patch) {
    const next = { ...readConfig() };
    if (patch.theme === "dark" || patch.theme === "light")
        next.theme = patch.theme;
    if (patch.viewMode === "split" || patch.viewMode === "unified")
        next.viewMode = patch.viewMode;
    if (typeof patch.model === "string")
        next.model = patch.model;
    if (typeof patch.autoCollapseViewed === "boolean")
        next.autoCollapseViewed = patch.autoCollapseViewed;
    if (typeof patch.verbose === "boolean")
        next.verbose = patch.verbose;
    if (typeof patch.thinking === "string" && VALID_THINKING.includes(patch.thinking))
        next.thinking = patch.thinking;
    if (typeof patch.minSeverity === "string" && VALID_SEVERITY.includes(patch.minSeverity))
        next.minSeverity = patch.minSeverity;
    saveConfig(next);
}
export function createRequestHandler(html, resolveOnce, resetHeartbeat) {
    const routes = {
        "GET /": (_req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        },
        "GET /ping": (_req, res) => {
            resetHeartbeat();
            res.writeHead(204);
            res.end();
        },
        "POST /config": async (req, res) => {
            const raw = await readBody(req);
            try {
                applyConfigPatch(JSON.parse(raw));
            }
            catch { /* ignore */ }
            res.writeHead(204);
            res.end();
        },
        "POST /action": async (req, res) => {
            const raw = await readBody(req);
            try {
                const action = JSON.parse(raw);
                res.writeHead(200);
                res.end();
                resolveOnce(action);
            }
            catch {
                res.writeHead(400);
                res.end();
            }
        },
    };
    return async (req, res) => {
        const key = `${req.method} ${req.url}`;
        const handler = routes[key];
        if (handler)
            await handler(req, res);
        else {
            res.writeHead(404);
            res.end();
        }
    };
}
