#!/usr/bin/env node
import { init } from "./init.js";
const command = process.argv[2];
if (command === "init") {
    await init();
}
else {
    console.error(`Unknown command: ${command ?? "(none)"}`);
    console.error("Usage: pi-reviewer init");
    process.exit(1);
}
