import { ChangeCard, type ContractChangeView } from "@schema-watch/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EmptyState } from "./EmptyState";

export function Timeline({
  endpointId,
  onSelectChange,
}: {
  endpointId: string | null;
  onSelectChange: (change: ContractChangeView) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: endpointId ? ["changes", endpointId] : ["changes"],
    queryFn: () => api.listChanges(endpointId ?? undefined),
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <div className="timeline">
      {data.map((change) => (
        <ChangeCard key={change.id} change={change} onClick={() => onSelectChange(change)} />
      ))}
    </div>
  );
}
