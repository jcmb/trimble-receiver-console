import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version?: string };

/** Embedded at build time (see Makefile: VITE_WEB_UI_VERSION). Falls back to package.json version. */
const webUiVersion =
  process.env.VITE_WEB_UI_VERSION?.trim() || pkg.version?.trim() || "dev";

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __WEB_UI_VERSION__: JSON.stringify(webUiVersion),
  },
  build: {
    outDir: "../cmd/server/dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8081",
    },
  },
});
