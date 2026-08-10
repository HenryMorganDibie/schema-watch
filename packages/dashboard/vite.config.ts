import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4561",
      "/ws": {
        target: "ws://localhost:4561",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
