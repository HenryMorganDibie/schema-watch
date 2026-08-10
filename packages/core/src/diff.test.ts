import assert from "node:assert/strict";
import { test } from "node:test";
import { inferSchema } from "./infer.js";
import { diffSchemas, summarizeChange } from "./diff.js";

test("detects the canonical userId string -> number breaking change", () => {
  const before = inferSchema({ userId: "abc123", name: "Ada" });
  const after = inferSchema({ userId: 123, name: "Ada" });
  const changes = diffSchemas(before, after, "response");
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.kind, "type-changed");
  assert.equal(changes[0]!.path, "userId");
  assert.equal(changes[0]!.severity, "BREAKING");
  assert.equal(summarizeChange(changes[0]!), "userId: string → number");
});

test("no changes when only values differ, not shape", () => {
  const before = inferSchema({ id: 1, createdAt: "2026-01-01T00:00:00Z" });
  const after = inferSchema({ id: 2, createdAt: "2026-08-10T00:00:00Z" });
  assert.deepEqual(diffSchemas(before, after, "response"), []);
});

test("removed required field is breaking, removed optional field is a warning", () => {
  const before = inferSchema({ id: 1, nickname: "a" });
  const after = inferSchema({ id: 1 });
  const changes = diffSchemas(before, after, "response");
  const removed = changes.find((c) => c.kind === "field-removed");
  assert.equal(removed?.severity, "BREAKING");
});

test("a response field becoming optional is breaking; a request field becoming optional is not", () => {
  const before = inferSchema({ id: 1, email: "a@b.com" });
  // Reuse array-merge to produce an "email optional" object shape.
  const after = inferSchema([{ id: 1, email: "a@b.com" }, { id: 2 }]);
  const afterObj = after.kind === "array" ? after.items! : after;
  const responseChanges = diffSchemas(before, afterObj, "response");
  const requestChanges = diffSchemas(before, afterObj, "request");
  assert.equal(responseChanges.find((c) => c.kind === "required-to-optional")?.severity, "BREAKING");
  assert.equal(requestChanges.find((c) => c.kind === "required-to-optional")?.severity, "INFO");
});

test("a new required request field is breaking; a new required response field is not", () => {
  const before = inferSchema({ id: 1 });
  const after = inferSchema({ id: 1, apiVersion: 2 });
  const requestChanges = diffSchemas(before, after, "request");
  const responseChanges = diffSchemas(before, after, "response");
  assert.equal(requestChanges.find((c) => c.kind === "field-added")?.severity, "BREAKING");
  assert.equal(responseChanges.find((c) => c.kind === "field-added")?.severity, "INFO");
});

test("a field becoming nullable is breaking (classic frontend null-crash)", () => {
  const before = inferSchema({ user: { name: "Ada" } });
  const after = inferSchema({ user: null });
  const changes = diffSchemas(before, after, "response");
  const nullable = changes.find((c) => c.kind === "became-nullable");
  assert.equal(nullable?.severity, "BREAKING");
  assert.equal(nullable?.path, "user");
});

test("a null-only value reports as 'null', never the internal 'unknown' kind", () => {
  const before = inferSchema({ user: { name: "Ada" } });
  const after = inferSchema({ user: null });
  const change = diffSchemas(before, after, "response").find((c) => c.kind === "became-nullable");
  assert.equal(change?.after, "null");
});

test("diffs inside array items using [] path notation", () => {
  const before = inferSchema({ users: [{ id: 1 }] });
  const after = inferSchema({ users: [{ id: "1" }] });
  const changes = diffSchemas(before, after, "response");
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.path, "users[].id");
});
