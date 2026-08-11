/** Sentinel mark: a hexagon watch-shape with a heartbeat trace through it -
 * "always watching, alerts on the spike." Deliberately not a generic circle
 * or a stock icon-font glyph. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2 L21 6.5 V17.5 L12 22 L3 17.5 V6.5 Z"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M5 12 H9 L10.5 8 L13 16 L14.5 12 H19"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
