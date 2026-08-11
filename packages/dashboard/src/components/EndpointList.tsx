import { EndpointRow, type EndpointView } from "@schema-watch/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function EndpointList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (endpoint: EndpointView) => void;
}) {
  const { data, isLoading } = useQuery({ queryKey: ["endpoints"], queryFn: api.listEndpoints });

  if (isLoading) return <div className="sidebar__section-label">Loading endpoints...</div>;
  if (!data || data.length === 0) return <div className="sidebar__section-label">No endpoints captured yet</div>;

  return (
    <div className="endpoint-list">
      <div className="sidebar__section-label">Endpoints ({data.length})</div>
      {data.map((endpoint) => (
        <EndpointRow
          key={endpoint.id}
          endpoint={endpoint}
          active={selectedId === endpoint.id}
          onClick={() => onSelect(endpoint)}
        />
      ))}
    </div>
  );
}
