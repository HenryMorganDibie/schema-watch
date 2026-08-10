import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { AgentConfig } from "../config.js";
import type { Db } from "../storage/sqlite.js";
import { createApiRouter } from "./routes.js";
import { attachWebSocketServer } from "./ws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startApiServer(db: Db, config: AgentConfig) {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter(db));

  // `schema-watch start` alone should be a complete local tool, so the agent
  // serves the built dashboard itself: from a bundled copy when installed
  // from npm, or from the sibling workspace when running inside this repo.
  // In dev, Vite serves :5173 and proxies /api and /ws here instead.
  const dashboardDist = [
    path.resolve(__dirname, "../../dashboard-dist"),
    path.resolve(__dirname, "../../../dashboard/dist"),
  ].find(existsSync);

  if (dashboardDist) {
    app.use(express.static(dashboardDist));
    app.get("*", (_req, res) => res.sendFile(path.join(dashboardDist, "index.html")));
  }

  const httpServer = createServer(app);
  attachWebSocketServer(httpServer);
  httpServer.listen(config.apiPort);
  return httpServer;
}
