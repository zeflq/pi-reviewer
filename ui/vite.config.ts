import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "fs";
import { resolve } from "path";

const { version } = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));

export default defineConfig({
  root: "ui",
  plugins: [react(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: "../dist-ui",
    emptyOutDir: true,
  },
});
