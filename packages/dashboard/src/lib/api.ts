import type { ContractChangeView, EndpointView } from "@schema-watch/ui";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listEndpoints: (): Promise<EndpointView[]> => fetch("/api/endpoints").then((res) => json<EndpointView[]>(res)),

  listChanges: (endpointId?: string): Promise<ContractChangeView[]> =>
    fetch(endpointId ? `/api/endpoints/${endpointId}/changes` : "/api/changes").then((res) =>
      json<ContractChangeView[]>(res),
    ),

  acknowledge: (endpointId: string, changeId: string): Promise<void> =>
    fetch(`/api/endpoints/${endpointId}/changes/${changeId}/ack`, { method: "POST" }).then(() => undefined),
};
