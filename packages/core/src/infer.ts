import type { JsonValue, PrimitiveType, SchemaNode } from "./types.js";

/** Infers the structural shape of a single JSON value. */
export function inferSchema(value: JsonValue | undefined): SchemaNode {
  if (value === undefined || value === null) {
    return { kind: "unknown", nullable: true };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", items: null, nullable: false };
    const items = value.map((v) => inferSchema(v)).reduce((a, b) => mergeSchema(a, b));
    return { kind: "array", items, nullable: false };
  }

  if (typeof value === "object") {
    const properties: Record<string, { required: boolean; schema: SchemaNode }> = {};
    for (const [key, val] of Object.entries(value)) {
      properties[key] = { required: true, schema: inferSchema(val) };
    }
    return { kind: "object", properties, nullable: false };
  }

  const primitiveType = typeOfPrimitive(value);
  return { kind: "primitive", type: primitiveType, nullable: false };
}

function typeOfPrimitive(value: string | number | boolean): PrimitiveType {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

/**
 * Merges two schema nodes observed at the same logical position (e.g. two
 * elements of the same array, or two samples of the same endpoint response)
 * into one node that describes both. Divergent shapes become a `union`
 * rather than being silently collapsed, so the diff engine can still tell
 * "string" apart from "string | number".
 */
export function mergeSchema(a: SchemaNode, b: SchemaNode): SchemaNode {
  if (a.kind === "unknown" && b.kind === "unknown") {
    return { kind: "unknown", nullable: a.nullable || b.nullable };
  }
  if (a.kind === "unknown") return withNullable(b, a.nullable || b.nullable);
  if (b.kind === "unknown") return withNullable(a, a.nullable || b.nullable);

  const nullable = a.nullable || b.nullable;

  if (a.kind === "primitive" && b.kind === "primitive") {
    if (a.type === b.type) return { kind: "primitive", type: a.type, nullable };
    return unionOf([withNullable(a, false), withNullable(b, false)], nullable);
  }

  if (a.kind === "array" && b.kind === "array") {
    const items =
      a.items && b.items
        ? mergeSchema(a.items, b.items)
        : a.items ?? b.items ?? null;
    return { kind: "array", items, nullable };
  }

  if (a.kind === "object" && b.kind === "object") {
    const keys = new Set([...Object.keys(a.properties), ...Object.keys(b.properties)]);
    const properties: Record<string, { required: boolean; schema: SchemaNode }> = {};
    for (const key of keys) {
      const ap = a.properties[key];
      const bp = b.properties[key];
      if (ap && bp) {
        properties[key] = { required: ap.required && bp.required, schema: mergeSchema(ap.schema, bp.schema) };
      } else {
        const only = ap ?? bp!;
        properties[key] = { required: false, schema: only.schema };
      }
    }
    return { kind: "object", properties, nullable };
  }

  if (a.kind === "union" || b.kind === "union") {
    const aOptions = a.kind === "union" ? a.options : [withNullable(a, false)];
    const bOptions = b.kind === "union" ? b.options : [withNullable(b, false)];
    return unionOf([...aOptions, ...bOptions], nullable);
  }

  // Structural mismatch (e.g. object vs array) - represent as a union of both.
  return unionOf([withNullable(a, false), withNullable(b, false)], nullable);
}

function withNullable(node: SchemaNode, nullable: boolean): SchemaNode {
  return { ...node, nullable };
}

function signature(node: SchemaNode): string {
  switch (node.kind) {
    case "unknown":
      return "unknown";
    case "primitive":
      return node.type;
    case "array":
      return `array<${node.items ? signature(node.items) : "unknown"}>`;
    case "object":
      return `object:${Object.keys(node.properties).sort().join(",")}`;
    case "union":
      return node.options.map(signature).sort().join("|");
  }
}

function unionOf(options: SchemaNode[], nullable: boolean): SchemaNode {
  const seen = new Map<string, SchemaNode>();
  for (const opt of options) {
    const sig = signature(opt);
    if (!seen.has(sig)) seen.set(sig, opt);
  }
  const deduped = [...seen.values()];
  if (deduped.length === 1) return withNullable(deduped[0]!, nullable);
  return { kind: "union", options: deduped, nullable };
}
