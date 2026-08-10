import { createHash } from "node:crypto";
import type { SchemaNode } from "./types.js";

/**
 * Deterministic hash of a schema tree (sorted keys) so the capture hot path
 * can skip the full diff when nothing about the shape changed since last
 * time - this runs on every request, so it has to be cheap.
 */
export function hashSchema(node: SchemaNode): string {
  return createHash("sha256").update(canonicalize(node)).digest("hex");
}

function canonicalize(node: SchemaNode): string {
  switch (node.kind) {
    case "unknown":
      return `u${node.nullable ? 1 : 0}`;
    case "primitive":
      return `p${node.nullable ? 1 : 0}:${node.type}`;
    case "array":
      return `a${node.nullable ? 1 : 0}:${node.items ? canonicalize(node.items) : "-"}`;
    case "object": {
      const keys = Object.keys(node.properties).sort();
      const body = keys.map((k) => `${k}${node.properties[k]!.required ? "!" : "?"}=${canonicalize(node.properties[k]!.schema)}`).join(",");
      return `o${node.nullable ? 1 : 0}:{${body}}`;
    }
    case "union":
      return `U${node.nullable ? 1 : 0}:[${node.options.map(canonicalize).sort().join(",")}]`;
  }
}
