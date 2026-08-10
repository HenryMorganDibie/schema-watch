import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCANNABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte"]);
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".next", ".git", "coverage"]);
const MAX_FILES = 8000;
const MAX_FILE_BYTES = 1_000_000;

/**
 * The signature feature: when a contract breaks, tell the developer WHICH of
 * their own files will feel it, not just what changed in the abstract. Greps
 * `frontendSrcDir` for literal references to the endpoint's static path
 * segments (works for plain fetch("/api/users/123") calls, template-literal
 * fetches, and React Query key arrays - anything that embeds the path as a
 * string literal). Best-effort by design: a regex grep, not a full AST/import
 * graph, so it stays instant on every request instead of needing a build step.
 */
export function findAffectedFiles(frontendSrcDir: string, pathPattern: string): string[] {
  const needles = staticSearchTerms(pathPattern);
  if (needles.length === 0) return [];

  const matches: string[] = [];
  let scanned = 0;

  const walk = (dir: string): void => {
    if (scanned >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanned >= MAX_FILES) return;
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name);
      if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

      scanned++;
      try {
        if (statSync(fullPath).size > MAX_FILE_BYTES) continue;
        const content = readFileSync(fullPath, "utf-8");
        if (needles.some((needle) => content.includes(needle))) {
          matches.push(path.relative(frontendSrcDir, fullPath).split(path.sep).join("/"));
        }
      } catch {
        // unreadable file (binary, permissions, race with a save) - skip it
      }
    }
  };

  walk(frontendSrcDir);
  return matches;
}

/** Extracts the static (non-`:id`) segments of a path pattern worth grepping for. */
function staticSearchTerms(pathPattern: string): string[] {
  const segments = pathPattern.split("/").filter(Boolean);
  const staticRuns: string[] = [];
  let current: string[] = [];

  for (const segment of segments) {
    if (segment === ":id") {
      if (current.length > 0) staticRuns.push("/" + current.join("/"));
      current = [];
    } else {
      current.push(segment);
    }
  }
  if (current.length > 0) staticRuns.push("/" + current.join("/"));

  // Require at least two static segments (e.g. "/api/users") to avoid
  // matching every file that happens to contain a single common word.
  return staticRuns.filter((run) => run.split("/").filter(Boolean).length >= 2);
}
