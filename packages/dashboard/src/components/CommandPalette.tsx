import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { EndpointView } from "@schema-watch/ui";

export function CommandPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (endpoint: EndpointView) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { data } = useQuery({ queryKey: ["endpoints"], queryFn: api.listEndpoints, enabled: open });

  const results = useMemo(() => {
    const all = data ?? [];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter((e) => `${e.method} ${e.pathPattern}`.toLowerCase().includes(q));
  }, [data, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && results[activeIndex]) {
      onSelect(results[activeIndex]!);
      onClose();
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          autoFocus
          className="command-palette__input"
          placeholder="Jump to an endpoint…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette__list">
          {results.length === 0 && <div className="command-palette__empty">No matching endpoints</div>}
          {results.map((endpoint, i) => (
            <div
              key={endpoint.id}
              className={`command-palette__item ${i === activeIndex ? "command-palette__item--active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => {
                onSelect(endpoint);
                onClose();
              }}
            >
              <span className="command-palette__item__method">{endpoint.method}</span>
              <span className="command-palette__item__path">{endpoint.pathPattern}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
