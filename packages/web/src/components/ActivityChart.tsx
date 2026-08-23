import { useState } from "react";
import type { AnalyticsPoint } from "../lib/api";

type SeriesKey = keyof Omit<AnalyticsPoint, "date">;

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "totalActivity", label: "Total activity", color: "var(--accent)" },
  { key: "newUsers", label: "New users", color: "var(--info)" },
  { key: "newProjects", label: "New projects", color: "var(--warning)" },
  { key: "schemasCaptured", label: "Schemas captured", color: "var(--text-secondary)" },
  { key: "breakingChanges", label: "Breaking changes", color: "var(--breaking)" },
];

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

/**
 * Inline SVG rather than a charting dependency. The whole chart is one series
 * of daily counts, which is not worth ~50kB of library, and it keeps the
 * bundle and the design system consistent with the rest of the app.
 */
export function ActivityChart({ points }: { points: AnalyticsPoint[] }) {
  const [active, setActive] = useState<SeriesKey>("totalActivity");
  const [hover, setHover] = useState<number | null>(null);

  const series = SERIES.find((s) => s.key === active)!;
  const values = points.map((p) => p[active]);
  const max = Math.max(1, ...values);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${PAD.top + plotH} L ${x(0).toFixed(1)} ${PAD.top + plotH} Z`;

  const total = values.reduce((a, b) => a + b, 0);
  const hovered = hover === null ? null : points[hover];

  return (
    <div className="chart">
      <div className="chart__legend">
        {SERIES.map((s) => (
          <button
            key={s.key}
            className={`chart__legend-item ${s.key === active ? "is-active" : ""}`}
            onClick={() => setActive(s.key)}
          >
            <span className="chart__swatch" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="chart__summary">
        {total.toLocaleString()} <span>{series.label.toLowerCase()} over this period</span>
      </div>

      <svg
        className="chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${series.label} per day`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines and the max label give the line a scale to read against. */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={PAD.top + plotH * f}
              y2={PAD.top + plotH * f}
              stroke="var(--gridline)"
              strokeWidth="1"
            />
            <text x={4} y={PAD.top + plotH * f + 4} className="chart__tick">
              {Math.round(max * (1 - f))}
            </text>
          </g>
        ))}

        <path d={area} fill={series.color} opacity="0.12" />
        <path d={line} fill="none" stroke={series.color} strokeWidth="2" strokeLinejoin="round" />

        {hovered && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
        )}
        {hovered && <circle cx={x(hover!)} cy={y(values[hover!]!)} r="4" fill={series.color} />}

        {/* Invisible hit areas: a 2px line is far too small to point at. */}
        {points.map((_, i) => (
          <rect
            key={i}
            x={x(i) - plotW / Math.max(1, points.length) / 2}
            y={PAD.top}
            width={plotW / Math.max(1, points.length)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        <text x={PAD.left} y={HEIGHT - 6} className="chart__tick">
          {points[0]?.date.slice(5)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="chart__tick">
          {points[points.length - 1]?.date.slice(5)}
        </text>
      </svg>

      <div className="chart__readout">
        {hovered ? `${hovered.date}: ${hovered[active].toLocaleString()} ${series.label.toLowerCase()}` : " "}
      </div>
    </div>
  );
}
