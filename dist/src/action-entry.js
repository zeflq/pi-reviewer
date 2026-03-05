import { readFile } from "node:fs/promises";
import { review } from "./review.js";
async function getPrInfo() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath)
        return undefined;
    try {
        const raw = await readFile(eventPath, "utf-8");
        const event = JSON.parse(raw);
        const number = event?.pull_request?.number;
        const headSha = event?.pull_request?.head?.sha;
        if (typeof number !== "number" || typeof headSha !== "string")
            return undefined;
        return { number, headSha };
    }
    catch {
        return undefined;
    }
}
const prInfo = await getPrInfo();
await review({
    pr: prInfo?.number,
    commitId: prInfo?.headSha,
    output: "comment",
});
