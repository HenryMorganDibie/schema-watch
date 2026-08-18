import { summarizeChange } from "@schema-watch/core";
import type { ContextBrief } from "./brief.js";

const ICON = { BREAKING: "🔴", WARNING: "🟡", INFO: "🟢" } as const;

/**
 * Renders a `ContextBrief` as markdown for `CONTEXT.md` / `CLAUDE.md`. Pure
 * formatter, no data access - kept separate from `buildContextBrief` so the
 * MCP server can hand structured JSON to a caller instead of parsing this
 * back out.
 */
export function renderContextBriefMarkdown(brief: ContextBrief): string {
  const lines: string[] = [];

  lines.push("## Schema-Watch API context");
  lines.push("");
  lines.push(`Proxy target: \`${brief.target}\`. Generated ${brief.generatedAt}.`);
  lines.push("");

  lines.push(`### Captured endpoints (${brief.endpoints.length})`);
  lines.push("");
  if (brief.endpoints.length === 0) {
    lines.push("None captured yet - run `schema-watch start` and drive traffic through the proxy.");
  } else {
    lines.push("| Method | Path | Status | Changes | Last seen |");
    lines.push("|---|---|---|---|---|");
    for (const e of brief.endpoints) {
      const icon = e.latestSeverity ? ICON[e.latestSeverity] : "⚪";
      lines.push(`| ${e.method} | \`${e.pathPattern}\` | ${icon} ${e.latestSeverity ?? "stable"} | ${e.changeCount} | ${e.lastSeenAt} |`);
    }
  }
  lines.push("");

  lines.push(`### Recent breaking changes (${brief.breakingChanges.length})`);
  lines.push("");
  if (brief.breakingChanges.length === 0) {
    lines.push("None recorded.");
  } else {
    for (const change of brief.breakingChanges) {
      lines.push(`- ${ICON.BREAKING} \`${change.method} ${change.pathPattern}\` (${change.target}), ${change.createdAt}`);
      for (const c of change.changes) {
        lines.push(`  - ${summarizeChange(c)}`);
      }
      if (change.affectedFiles.length > 0) {
        lines.push(`  - affects: ${change.affectedFiles.map((f) => `\`${f}\``).join(", ")}`);
      }
    }
  }
  lines.push("");

  if (brief.frontendReferences) {
    lines.push(`### Frontend cross-reference (${brief.frontendSrcDir})`);
    lines.push("");
    if (brief.frontendReferences.length === 0) {
      lines.push("No frontend files currently reference a captured endpoint.");
    } else {
      for (const ref of brief.frontendReferences) {
        lines.push(`- \`${ref.method} ${ref.pathPattern}\` → ${ref.files.map((f) => `\`${f}\``).join(", ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
