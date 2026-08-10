import { useLiveStore } from "../lib/liveStore";
import type { ContractChangeRecord } from "../lib/types";

export function ToastStack({ onOpen }: { onOpen: (change: ContractChangeRecord) => void }) {
  const toasts = useLiveStore((s) => s.toasts);
  const dismiss = useLiveStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => onOpen(t.change)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast__title">
              Breaking change · {t.change.method} {t.change.pathPattern}
            </div>
            <div className="toast__body">{t.change.changes[0] ? t.change.changes[0].path : ""}</div>
          </div>
          <button
            className="toast__close"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(t.id);
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
