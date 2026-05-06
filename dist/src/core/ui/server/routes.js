import { readConfig, saveConfig } from "./config.js";
const VALID_THINKING = ["off", "minimal", "low", "medium", "high", "xhigh"];
function readBody(req) {
    return new Promise((res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => res(body));
    });
}
function configRoute(extract) {
    return async (req, res) => {
        const raw = await readBody(req);
        try {
            const patch = extract(JSON.parse(raw));
            if (patch)
                saveConfig({ ...readConfig(), ...patch });
        }
        catch { /* ignore */ }
        res.writeHead(204);
        res.end();
    };
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
        "POST /theme": configRoute((b) => {
            const { theme } = b;
            return theme === "dark" || theme === "light" ? { theme } : undefined;
        }),
        "POST /viewmode": configRoute((b) => {
            const { viewMode } = b;
            return viewMode === "split" || viewMode === "unified" ? { viewMode } : undefined;
        }),
        "POST /model": configRoute((b) => {
            const { model } = b;
            return typeof model === "string" ? { model } : undefined;
        }),
        "POST /thinking": configRoute((b) => {
            const { thinking } = b;
            return typeof thinking === "string" && VALID_THINKING.includes(thinking)
                ? { thinking: thinking }
                : undefined;
        }),
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
