import type { BodyTarget, SchemaChange, SchemaNode } from "./types.js";

/** Human-readable type signature, used both to decide "did this change" and as the before/after label. */
export function typeSignature(node: SchemaNode): string {
  // A value only ever observed as null has no underlying type to report yet;
  // say "null" rather than leaking the internal "unknown" node kind.
  if (node.kind === "unknown" && node.nullable) return "null";

  const base = ((): string => {
    switch (node.kind) {
      case "unknown":
        return "unknown";
      case "primitive":
        return node.type;
      case "array":
        return `${node.items ? typeSignature(node.items) : "unknown"}[]`;
      case "object":
        return "object";
      case "union":
        return [...new Set(node.options.map(typeSignature))].sort().join(" | ");
    }
  })();
  return node.nullable ? `${base} | null` : base;
}

/**
 * Diffs two schema snapshots of the same endpoint + body target and returns
 * every structural change, classified by how likely it is to break a caller.
 *
 * Severity depends on `target`: a new required field is breaking for a
 * *request* body (existing callers stop sending it) but harmless for a
 * *response* body; a field that quietly becomes optional is breaking for a
 * *response* body (consumers assumed it was always there) but safe for a
 * request body (the server just got more lenient).
 */
export function diffSchemas(before: SchemaNode, after: SchemaNode, target: BodyTarget): SchemaChange[] {
  const changes: SchemaChange[] = [];
  walk("", before, after, target, changes);
  return changes;
}

function walk(path: string, before: SchemaNode, after: SchemaNode, target: BodyTarget, out: SchemaChange[]): void {
  if (!before.nullable && after.nullable) {
    out.push({ kind: "became-nullable", path: path || "(root)", severity: "BREAKING", before: typeSignature(before), after: typeSignature(after) });
  } else if (before.nullable && !after.nullable) {
    out.push({ kind: "became-non-nullable", path: path || "(root)", severity: "INFO", before: typeSignature(before), after: typeSignature(after) });
  }

  if (before.kind === "object" && after.kind === "object") {
    const keys = new Set([...Object.keys(before.properties), ...Object.keys(after.properties)]);
    for (const key of keys) {
      const bp = before.properties[key];
      const ap = after.properties[key];
      const childPath = path ? `${path}.${key}` : key;

      if (bp && !ap) {
        out.push({
          kind: "field-removed",
          path: childPath,
          severity: bp.required ? "BREAKING" : "WARNING",
          before: typeSignature(bp.schema),
          after: undefined,
        });
        continue;
      }
      if (!bp && ap) {
        out.push({
          kind: "field-added",
          path: childPath,
          severity: ap.required && target === "request" ? "BREAKING" : "INFO",
          before: undefined,
          after: typeSignature(ap.schema),
        });
        continue;
      }
      if (bp && ap) {
        if (bp.required && !ap.required) {
          out.push({
            kind: "required-to-optional",
            path: childPath,
            severity: target === "response" ? "BREAKING" : "INFO",
            before: typeSignature(bp.schema),
            after: typeSignature(ap.schema),
          });
        } else if (!bp.required && ap.required) {
          out.push({
            kind: "optional-to-required",
            path: childPath,
            severity: target === "request" ? "BREAKING" : "WARNING",
            before: typeSignature(bp.schema),
            after: typeSignature(ap.schema),
          });
        }
        walk(childPath, bp.schema, ap.schema, target, out);
      }
    }
    return;
  }

  if (before.kind === "array" && after.kind === "array") {
    if (before.items && after.items) {
      walk(`${path}[]`, before.items, after.items, target, out);
    }
    return;
  }

  if (before.kind === "unknown" || after.kind === "unknown") return;

  const beforeSig = typeSignature(before);
  const afterSig = typeSignature(after);
  if (beforeSig !== afterSig) {
    out.push({ kind: "type-changed", path: path || "(root)", severity: "BREAKING", before: beforeSig, after: afterSig });
  }
}

/** One-line human summary for a change, used in the dashboard timeline, Slack messages, and CI output. */
export function summarizeChange(change: SchemaChange): string {
  const path = change.path || "(root)";
  switch (change.kind) {
    case "field-removed":
      return `${path} was removed (was ${change.before})`;
    case "field-added":
      return `${path} was added (${change.after})`;
    case "type-changed":
      return `${path}: ${change.before} → ${change.after}`;
    case "became-nullable":
      return `${path} can now be null (was ${change.before})`;
    case "became-non-nullable":
      return `${path} is no longer nullable`;
    case "required-to-optional":
      return `${path} is no longer always present`;
    case "optional-to-required":
      return `${path} is now required`;
  }
}

/** Highest severity across a set of changes, or null if there are none. */
export function worstSeverity(changes: SchemaChange[]): SchemaChange["severity"] | null {
  if (changes.some((c) => c.severity === "BREAKING")) return "BREAKING";
  if (changes.some((c) => c.severity === "WARNING")) return "WARNING";
  if (changes.length > 0) return "INFO";
  return null;
}
