import assert from "node:assert/strict";
import { test } from "node:test";
import { inferSchema } from "@schema-watch/core";
import { compareContracts } from "./compare.js";
import { renderMarkdownReport, COMMENT_MARKER } from "./format.js";
import { renderSarif } from "./sarif.js";
import type { ContractEntry } from "../export.js";

const entry = (pathPattern: string, body: unknown): ContractEntry => ({
  method: "GET",
  pathPattern,
  target: "response",
  statusCode: 200,
  schema: inferSchema(body as never),
});

test("flags a breaking type change and fails the run", () => {
  const before = [entry("/api/users/:id", { userId: "abc", name: "Ada" })];
  const after = [entry("/api/users/:id", { userId: 1, name: "Ada" })];

  const result = compareContracts(before, after);
  assert.equal(result.pass, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.severity, "BREAKING");
});

test("passes when only values changed", () => {
  const before = [entry("/api/users/:id", { userId: "abc", seen: 1 })];
  const after = [entry("/api/users/:id", { userId: "zzz", seen: 99 })];

  const result = compareContracts(before, after);
  assert.equal(result.pass, true);
  assert.equal(result.findings.length, 0);
});

test("a new optional response field is reported but does not fail the run", () => {
  const before = [entry("/api/projects", { id: 1 })];
  const after = [entry("/api/projects", { id: 1, archived: false })];

  const result = compareContracts(before, after);
  assert.equal(result.pass, true);
  assert.equal(result.findings[0]?.severity, "INFO");
});

test("an endpoint missing from the new contract is not reported as removed", () => {
  // In CI a contract only holds what the tests exercised, so absence must not
  // be treated as deletion or every skipped test becomes a false alarm.
  const before = [entry("/api/users/:id", { id: 1 }), entry("/api/orders/:id", { id: 2 })];
  const after = [entry("/api/users/:id", { id: 1 })];

  const result = compareContracts(before, after);
  assert.equal(result.pass, true);
  assert.equal(result.findings.length, 0);
});

test("an endpoint absent from the baseline counts as new, not as a change", () => {
  const before = [entry("/api/users/:id", { id: 1 })];
  const after = [entry("/api/users/:id", { id: 1 }), entry("/api/teams", { id: 9 })];

  const result = compareContracts(before, after);
  assert.deepEqual(result.newEndpoints, ["GET /api/teams"]);
  assert.equal(result.findings.length, 0);
});

test("breaking findings sort ahead of informational ones", () => {
  const before = [entry("/api/a", { v: 1 }), entry("/api/b", { v: "x" })];
  const after = [entry("/api/a", { v: 1, extra: true }), entry("/api/b", { v: 2 })];

  const result = compareContracts(before, after);
  assert.equal(result.findings[0]!.severity, "BREAKING");
});

test("affected files are attached from the finder", () => {
  const before = [entry("/api/users/:id", { userId: "abc" })];
  const after = [entry("/api/users/:id", { userId: 1 })];

  const result = compareContracts(before, after, () => ["src/UserCard.tsx"]);
  assert.deepEqual(result.findings[0]!.affectedFiles, ["src/UserCard.tsx"]);
});

test("markdown report carries the marker so reruns update one comment", () => {
  const before = [entry("/api/users/:id", { userId: "abc" })];
  const after = [entry("/api/users/:id", { userId: 1 })];

  const md = renderMarkdownReport(compareContracts(before, after, () => ["src/UserCard.tsx"]));
  assert.ok(md.startsWith(COMMENT_MARKER));
  assert.ok(md.includes("- userId: string"));
  assert.ok(md.includes("+ userId: number"));
  assert.ok(md.includes("src/UserCard.tsx"));
});

test("clean run still produces a comment body", () => {
  const md = renderMarkdownReport(compareContracts([entry("/a", { v: 1 })], [entry("/a", { v: 2 })]));
  assert.ok(md.includes("No API contract changes"));
});

test("sarif is valid 2.1.0 and locates findings on affected files", () => {
  const before = [entry("/api/users/:id", { userId: "abc" })];
  const after = [entry("/api/users/:id", { userId: 1 })];

  const sarif = JSON.parse(renderSarif(compareContracts(before, after, () => ["src/UserCard.tsx"])));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.name, "Schema-Watch");
  assert.equal(sarif.runs[0].results[0].level, "error");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "src/UserCard.tsx");
  assert.ok(sarif.runs[0].tool.driver.rules.some((r: { id: string }) => r.id === "schema-watch/type-changed"));
});

test("sarif falls back to the contract file when nothing references the endpoint", () => {
  const before = [entry("/api/users/:id", { userId: "abc" })];
  const after = [entry("/api/users/:id", { userId: 1 })];

  const sarif = JSON.parse(renderSarif(compareContracts(before, after), "contract.json"));
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "contract.json");
});
