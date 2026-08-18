import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function writeContextFile(path: string, markdown: string): void {
  writeFileSync(path, markdown);
}

/**
 * Idempotently updates a fenced block inside a file the user owns (like
 * `CLAUDE.md`) so repeat runs replace the previous brief instead of
 * duplicating it. Appends the block (with markers) if the file doesn't exist
 * yet or doesn't contain them.
 */
export function upsertFencedBlock(filePath: string, startMarker: string, endMarker: string, content: string): void {
  const block = `${startMarker}\n${content.trimEnd()}\n${endMarker}`;
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";

  const startIndex = existing.indexOf(startMarker);
  const endIndex = existing.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex);
    const after = existing.slice(endIndex + endMarker.length);
    writeFileSync(filePath, `${before}${block}${after}`);
    return;
  }

  const separator = existing.length > 0 && !existing.endsWith("\n\n") ? (existing.endsWith("\n") ? "\n" : "\n\n") : "";
  writeFileSync(filePath, `${existing}${separator}${block}\n`);
}
