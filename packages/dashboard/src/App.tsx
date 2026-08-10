import { useEffect, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { DiffViewer } from "./components/DiffViewer";
import { EndpointList } from "./components/EndpointList";
import { Logo } from "./components/Logo";
import { StatusPulse } from "./components/StatusPulse";
import { Timeline } from "./components/Timeline";
import { ToastStack } from "./components/ToastStack";
import { useLiveFeed } from "./lib/useLiveFeed";
import type { ContractChangeRecord, EndpointSummary } from "./lib/types";

export default function App() {
  useLiveFeed();

  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointSummary | null>(null);
  const [selectedChange, setSelectedChange] = useState<ContractChangeRecord | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__header">
          <Logo />
          <span className="sidebar__brand">Schema-Watch</span>
        </div>
        <div className="sidebar__search-hint" onClick={() => setPaletteOpen(true)}>
          Jump to endpoint
          <kbd>⌘K</kbd>
        </div>
        <EndpointList
          selectedId={selectedEndpoint?.id ?? null}
          onSelect={(e) => {
            setSelectedEndpoint((prev) => (prev?.id === e.id ? null : e));
            setSelectedChange(null);
          }}
        />
      </aside>

      <main className="main">
        <div className="topbar">
          <span className="topbar__title">
            {selectedEndpoint ? `${selectedEndpoint.method} ${selectedEndpoint.pathPattern}` : "All activity"}
          </span>
          <StatusPulse />
        </div>
        <div className="main__body">
          {selectedChange ? (
            <DiffViewer change={selectedChange} onBack={() => setSelectedChange(null)} />
          ) : (
            <Timeline endpointId={selectedEndpoint?.id ?? null} onSelectChange={setSelectedChange} />
          )}
        </div>
      </main>

      <ToastStack
        onOpen={(change) => {
          setSelectedEndpoint(null);
          setSelectedChange(change);
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(e) => {
          setSelectedEndpoint(e);
          setSelectedChange(null);
        }}
      />
    </div>
  );
}
