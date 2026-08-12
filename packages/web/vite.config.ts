import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@schema-watch/ui/styles.css": path.resolve(__dirname, "../ui/src/styles/index.css"),
      "@schema-watch/ui": path.resolve(__dirname, "../ui/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    // Dev only. In production the API lives on another host entirely (see
    // VITE_API_URL), because this app deploys as static files to a CDN.
    proxy: { "/api": "http://localhost:4000" },
  },
  build: { outDir: "dist" },
});
