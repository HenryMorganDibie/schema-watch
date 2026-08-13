import { summarizeChange } from "@schema-watch/core";
import type { ComparisonResult, EndpointFinding } from "./compare.js";

/** Hidden marker so repeated runs update one comment instead of adding a new
 * one on every push. */
export const COMMENT_MARKER = "<!-- schema-watch-report -->";

const ICON = { BREAKING: "🔴", WARNING: "🟡", INFO: "🟢" } as const;

/**
 * Renders one endpoint as a diff fence. GitHub colours `-` red and `+` green
 * inside a ```diff block, which is what makes the comment readable at a
 * glance rather than a wall of prose.
 */
function renderFinding(finding: EndpointFinding): string {
  const lines: string[] = [];
  lines.push(`### ${ICON[finding.severity]} \`${finding.method} ${finding.pathPattern}\``);
  lines.push("");
  lines.push("```diff");
  for (const change of finding.changes) {
    const path = change.path || "(root)";
    if (change.before && change.after) {
      lines.push(`- ${path}: ${change.before}`);
      lines.push(`+ ${path}: ${change.after}`);
    } else if (change.before) {
      lines.push(`- ${path}: ${change.before}`);
    } else if (change.after) {
      lines.push(`+ ${path}: ${change.after}`);
    } else {
      lines.push(`! ${summarizeChange(change)}`);
    }
  }
  lines.push("```");

  if (finding.affectedFiles.length > 0) {
    lines.push("");
    lines.push(`**Affected frontend files (${finding.affectedFiles.length}):**`);
    for (const file of finding.affectedFiles.slice(0, 10)) lines.push(`- \`${file}\``);
    if (finding.affectedFiles.length > 10) {
      lines.push(`- ...and ${finding.affectedFiles.length - 10} more`);
    }
  }

  return lines.join("\n");
}

export function renderMarkdownReport(result: ComparisonResult): string {
  const breaking = result.findings.filter((f) => f.severity === "BREAKING");
  const other = result.findings.filter((f) => f.severity !== "BREAKING");

  const lines: string[] = [COMMENT_MARKER, ""];

  if (result.findings.length === 0) {
    lines.push("## ✅ No API contract changes");
    lines.push("");
    lines.push("Schema-Watch compared this branch's contract against the baseline and found no shape changes.");
    if (result.newEndpoints.length > 0) {
      lines.push("");
      lines.push(`${result.newEndpoints.length} new endpoint(s) seen for the first time: ${result.newEndpoints.map((e) => `\`${e}\``).join(", ")}`);
    }
    return lines.join("\n");
  }

  lines.push(
    breaking.length > 0
      ? `## 🔴 Schema-Watch detected ${breaking.length} breaking API change${breaking.length === 1 ? "" : "s"}`
      : "## 🟡 Schema-Watch detected API contract changes",
  );
  lines.push("");

  for (const finding of [...breaking, ...other]) {
    lines.push(renderFinding(finding));
    lines.push("");
  }

  if (result.newEndpoints.length > 0) {
    lines.push(`<sub>New endpoints: ${result.newEndpoints.map((e) => `\`${e}\``).join(", ")}</sub>`);
    lines.push("");
  }

  lines.push("<sub>Shape-only diff: changing values never trigger this. ");
  lines.push("Update the committed baseline to accept these changes.</sub>");

  return lines.join("\n");
}

/** Plain-text version for the workflow log. */
export function renderConsoleReport(result: ComparisonResult): string {
  if (result.findings.length === 0) return "No API contract changes.";

  const lines: string[] = [];
  for (const finding of result.findings) {
    lines.push(`${finding.severity}  ${finding.method} ${finding.pathPattern} (${finding.target})`);
    for (const change of finding.changes) {
      lines.push(`    ${summarizeChange(change)}`);
    }
    if (finding.affectedFiles.length > 0) {
      lines.push(`    affects: ${finding.affectedFiles.join(", ")}`);
    }
  }
  return lines.join("\n");
}
