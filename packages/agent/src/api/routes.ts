import { Router } from "express";
import type { Db } from "../storage/sqlite.js";
import { acknowledgeChange, getEndpoint, listChanges, listEndpointSummaries } from "../storage/queries.js";
import { serializeChange } from "./serialize.js";

export function createApiRouter(db: Db): Router {
  const router = Router();

  router.get("/endpoints", (_req, res) => {
    const rows = listEndpointSummaries(db);
    res.json(
      rows.map((r) => ({
        id: r.id,
        method: r.method,
        pathPattern: r.path_pattern,
        lastSeenAt: r.last_seen_at,
        latestSeverity: r.latest_severity,
        changeCount: r.change_count,
      })),
    );
  });

  router.get("/changes", (_req, res) => {
    res.json(listChanges(db).map(serializeChange));
  });

  router.get("/endpoints/:id/changes", (req, res) => {
    const endpoint = getEndpoint(db, req.params.id);
    if (!endpoint) return res.status(404).json({ error: "endpoint not found" });
    res.json(listChanges(db, req.params.id).map(serializeChange));
  });

  router.post("/endpoints/:endpointId/changes/:changeId/ack", (req, res) => {
    acknowledgeChange(db, req.params.changeId);
    res.status(204).end();
  });

  router.get("/health", (_req, res) => res.json({ ok: true }));

  return router;
}
