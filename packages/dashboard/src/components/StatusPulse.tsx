import { useLiveStore } from "../lib/liveStore";

const LABEL = {
  connecting: "Connecting…",
  open: "Live",
  closed: "Reconnecting…",
};

export function StatusPulse() {
  const status = useLiveStore((s) => s.status);
  return (
    <span className={`status-pulse status-pulse--${status}`}>
      <span className="status-pulse__dot" />
      {LABEL[status]}
    </span>
  );
}
