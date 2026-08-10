import assert from "node:assert/strict";
import { test } from "node:test";
import { inferSchema } from "./infer.js";
import { typeSignature } from "./diff.js";

test("infers primitive types", () => {
  assert.equal(typeSignature(inferSchema("hi")), "string");
  assert.equal(typeSignature(inferSchema(42)), "number");
  assert.equal(typeSignature(inferSchema(true)), "boolean");
});

test("infers null as nullable unknown", () => {
  const node = inferSchema(null);
  assert.equal(node.kind, "unknown");
  assert.equal(node.nullable, true);
});

test("infers object shape with required keys", () => {
  const node = inferSchema({ id: 1, name: "a" });
  assert.equal(node.kind, "object");
  if (node.kind === "object") {
    assert.equal(node.properties.id?.required, true);
    assert.equal(typeSignature(node.properties.id!.schema), "number");
  }
});

test("merges array element shapes, flags optional keys not present in every element", () => {
  const node = inferSchema([{ id: 1, name: "a" }, { id: 2 }]);
  assert.equal(node.kind, "array");
  if (node.kind === "array" && node.items?.kind === "object") {
    assert.equal(node.items.properties.id?.required, true);
    assert.equal(node.items.properties.name?.required, false);
  } else {
    assert.fail("expected array of objects");
  }
});

test("divergent primitive types across samples become a union", () => {
  const node = inferSchema([{ id: 1 }, { id: "abc" }]);
  if (node.kind === "array") {
    assert.equal(typeSignature(node.items!), "object");
    if (node.items?.kind === "object") {
      assert.equal(typeSignature(node.items.properties.id!.schema), "number | string");
    }
  }
});
