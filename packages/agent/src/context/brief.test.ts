import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentConfig } from "../config.js";
import { openDatabase } from "../storage/sqlite.js";
import { getOrCreateEndpoint, insertChange, insertSnapshot } from "../storage/queries.js";
import { buildContextBrief } from "./brief.js";

function baseConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    target: "http://localhost:3001",
    proxyPort: 4560,
    apiPort: 4561,
    dbPath: ":memory:",
    sync: { enabled: false },
    ...overrides,
  };
}

test("lists captured endpoints", () => {
  const db = openDatabase(":memory:");
  getOrCreateEndpoint(db, "GET", "/api/users/:id");
  getOrCreateEndpoint(db, "POST", "/api/orders");

  const brief = buildContextBrief(db, baseConfig());
  assert.equal(brief.endpoints.length, 2);
  assert.deepEqual(
    brief.endpoints.map((e) => `${e.method} ${e.pathPattern}`).sort(),
    ["GET /api/users/:id", "POST /api/orders"],
  );
});

test("only breaking changes are included, most recent first, capped at the limit", () => {
  const db = openDatabase(":memory:");
  const endpoint = getOrCreateEndpoint(db, "GET", "/api/users/:id");

  insertChange(db, { endpointId: endpoint.id, target: "response", severity: "WARNING", changes: [], affectedFiles: [] });
  insertChange(db, { endpointId: endpoint.id, target: "response", severity: "BREAKING", changes: [{ kind: "type-changed", path: "userId", severity: "BREAKING", before: "string", after: "number" }], affectedFiles: ["src/UserCard.tsx"] });
  insertChange(db, { endpointId: endpoint.id, target: "response", severity: "INFO", changes: [], affectedFiles: [] });

  const brief = buildContextBrief(db, baseConfig(), { limit: 1 });
  assert.equal(brief.breakingChanges.length, 1);
  assert.equal(brief.breakingChanges[0]!.affectedFiles[0], "src/UserCard.tsx");
});

test("omits frontendReferences entirely when frontendSrcDir is not configured", () => {
  const db = openDatabase(":memory:");
  const brief = buildContextBrief(db, baseConfig());
  assert.equal(brief.frontendReferences, undefined);
});
