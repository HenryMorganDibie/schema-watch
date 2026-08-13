import { summarizeChange, type ChangeSeverity, type SchemaChangeKind } from "@schema-watch/core";
import type { ComparisonResult } from "./compare.js";

const TOOL_URI = "https://github.com/HenryMorganDibie/schema-watch";

// SARIF levels are fixed vocabulary; map our severities onto them so Code
// Scanning sorts and filters findings the same way it does for linters.
const LEVEL: Record<ChangeSeverity, "error" | "warning" | "note"> = {
  BREAKING: "error",
  WARNING: "warning",
  INFO: "note",
};

const RULE_DESCRIPTIONS: Record<SchemaChangeKind, string> = {
  "type-changed": "A field's type changed, which breaks callers that parse it as the old type.",
  "field-removed": "A field disappeared from the payload.",
  "field-added": "A field was added to the payload.",
  "became-nullable": "A field can now be null, which breaks callers that dereference it directly.",
  "became-non-nullable": "A field is no longer nullable.",
  "required-to-optional": "A field is no longer always present.",
  "optional-to-required": "A field is now required.",
};

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: unknown[];
  partialFingerprints: Record<string, string>;
}

/**
 * SARIF 2.1.0, for `github/codeql-action/upload-sarif`. Findings then appear
 * in the repository's Security tab alongside static-analysis results.
 *
 * Affected frontend files are used as the result location, so a contract
 * break is annotated on the code that actually consumes the endpoint rather
 * than on a config file nobody reads.
 */
export function renderSarif(result: ComparisonResult, fallbackPath = "contract.json"): string {
  const usedRules = new Map<string, { id: string; kind: SchemaChangeKind }>();
  const results: SarifResult[] = [];

  for (const finding of result.findings) {
    for (const change of finding.changes) {
      const ruleId = `schema-watch/${change.kind}`;
      usedRules.set(ruleId, { id: ruleId, kind: change.kind });

      const endpoint = `${finding.method} ${finding.pathPattern}`;
      const text = `${endpoint} (${finding.target}): ${summarizeChange(change)}`;

      // One result per affected file so each consuming file is annotated;
      // fall back to the contract itself when nothing references the endpoint.
      const targets = finding.affectedFiles.length > 0 ? finding.affectedFiles : [fallbackPath];

      for (const file of targets) {
        results.push({
          ruleId,
          level: LEVEL[change.severity],
          message: { text },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: file },
                region: { startLine: 1 },
              },
            },
          ],
          // Keeps a finding identified across runs even if line numbers move,
          // so Code Scanning does not report the same break as brand new.
          partialFingerprints: {
            schemaWatchChange: `${endpoint}:${finding.target}:${change.path}:${change.kind}`,
          },
        });
      }
    }
  }

  const rules = [...usedRules.values()].map((rule) => ({
    id: rule.id,
    name: rule.kind.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
    shortDescription: { text: RULE_DESCRIPTIONS[rule.kind] },
    fullDescription: { text: RULE_DESCRIPTIONS[rule.kind] },
    helpUri: TOOL_URI,
    properties: { tags: ["api", "contract"] },
  }));

  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "Schema-Watch",
              informationUri: TOOL_URI,
              rules,
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  );
}
