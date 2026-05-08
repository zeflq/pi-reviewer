import { applyConfigPatch } from "../../config.js";
function readBody(req) {
    return new Promise((res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => res(body));
    });
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
