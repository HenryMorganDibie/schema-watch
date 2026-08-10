export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PrimitiveType = "string" | "number" | "boolean";

export type BodyTarget = "request" | "response";

/**
 * Structural shape of a JSON value: type + nullability + nesting, never the
 * actual data. Diffing this instead of raw values is what keeps alerts signal
 * (a changed field type) instead of noise (a changed timestamp value).
 */
export type SchemaNode =
  | { kind: "primitive"; type: PrimitiveType; nullable: boolean }
  | { kind: "array"; items: SchemaNode | null; nullable: boolean }
  | { kind: "object"; properties: Record<string, PropertyNode>; nullable: boolean }
  | { kind: "union"; options: SchemaNode[]; nullable: boolean }
  /** Seen only as `null` (or absent/undefined) - real type not yet observed. */
  | { kind: "unknown"; nullable: boolean };

export interface PropertyNode {
  /** true only if this key was present in every sampled object at this position */
  required: boolean;
  schema: SchemaNode;
}

export type ChangeSeverity = "BREAKING" | "WARNING" | "INFO";

export type SchemaChangeKind =
  | "field-removed"
  | "field-added"
  | "type-changed"
  | "became-nullable"
  | "became-non-nullable"
  | "required-to-optional"
  | "optional-to-required";

export interface SchemaChange {
  kind: SchemaChangeKind;
  /** dot/bracket path from the body root, e.g. "user.roles[].id", "" for root */
  path: string;
  severity: ChangeSeverity;
  before?: string;
  after?: string;
}

export interface EndpointRef {
  method: string;
  pathPattern: string;
}
