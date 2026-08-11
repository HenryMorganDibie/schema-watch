import type { ChangeSeverity } from "@schema-watch/core";

const LABEL: Record<ChangeSeverity, string> = {
  BREAKING: "Breaking",
  WARNING: "Warning",
  INFO: "Safe",
};

const VAR: Record<ChangeSeverity, string> = {
  BREAKING: "--breaking",
  WARNING: "--warning",
  INFO: "--info",
};

/** Color is decorative here (a dot); the label always carries the meaning in
 * normal text ink, so this reads fine even for colorblind users or at a glance
 * on a low-contrast display - never rely on hue alone. */
export function SeverityBadge({ severity, size = "md" }: { severity: ChangeSeverity; size?: "sm" | "md" }) {
  const colorVar = VAR[severity];
  return (
    <span
      className="severity-badge"
      style={{
        // @ts-expect-error -- CSS custom property passthrough
        "--badge-color": `var(${colorVar})`,
        "--badge-bg": `var(${colorVar}-soft-bg)`,
        "--badge-border": `var(${colorVar}-soft-border)`,
        fontSize: size === "sm" ? 11 : 12,
        padding: size === "sm" ? "1px 7px 1px 6px" : "2px 9px 2px 7px",
      }}
    >
      <span className="severity-badge__dot" />
      {LABEL[severity]}
    </span>
  );
}
