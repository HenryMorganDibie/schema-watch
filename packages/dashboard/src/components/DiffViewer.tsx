import { summarizeChange } from "@schema-watch/core";
import { SeverityBadge } from "./SeverityBadge";
import type { ContractChangeRecord } from "../lib/types";

export function DiffViewer({ change, onBack }: { change: ContractChangeRecord; onBack: () => void }) {
  return (
    <div>
      <button className="icon-button" onClick={onBack} style={{ marginBottom: 12, fontSize: 12.5 }}>
        ← Back to timeline
      </button>
      <div className="diff-viewer">
        <div className="diff-viewer__header">
          <div>
            <div className="diff-viewer__endpoint">
              {change.method} {change.pathPattern}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{change.target} body</div>
          </div>
          <SeverityBadge severity={change.severity} />
        </div>

        {change.changes.map((c, i) => (
          <div className="diff-change-row" key={i}>
            <span className="diff-change-row__path">{c.path || "(root)"}</span>
            <span className="diff-change-row__values">
              {c.before && <span className="diff-before">{c.before}</span>}
              {c.before && c.after && <span className="diff-arrow">→</span>}
              {c.after && <span className="diff-after">{c.after}</span>}
              {!c.before && !c.after && <span>{summarizeChange(c)}</span>}
            </span>
          </div>
        ))}

        {change.affectedFiles.length > 0 && (
          <div className="affected-files">
            <div className="affected-files__label">
              {change.affectedFiles.length} file{change.affectedFiles.length === 1 ? "" : "s"} reference this endpoint
            </div>
            <div className="affected-files__list">
              {change.affectedFiles.map((file) => (
                <span className="affected-files__chip" key={file}>
                  {file}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
