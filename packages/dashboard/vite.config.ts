import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the shared UI package as source so it needs no build step and
      // stays hot-reloadable while developing either app.
      "@schema-watch/ui/styles.css": path.resolve(import.meta.dirname, "../ui/src/styles/index.css"),
      "@schema-watch/ui": path.resolve(import.meta.dirname, "../ui/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4561",
      "/ws": { target: "ws://localhost:4561", ws: true },
    },
  },
  build: { outDir: "dist" },
});
