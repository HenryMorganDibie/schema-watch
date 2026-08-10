const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
const MONGO_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Collapses a concrete request path into an endpoint pattern so
 * `/api/users/123` and `/api/users/456` are recognized as the same endpoint
 * instead of two thousand separate ones. Good enough without a route table:
 * any path segment that looks like an id gets replaced with `:id`.
 */
export function toPathPattern(pathname: string): string {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  const normalized = segments.map((segment) => (looksLikeId(segment) ? ":id" : segment));
  return "/" + normalized.join("/");
}

function looksLikeId(segment: string): boolean {
  return UUID_RE.test(segment) || NUMERIC_RE.test(segment) || MONGO_ID_RE.test(segment);
}
