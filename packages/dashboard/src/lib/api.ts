import type { ContractChangeRecord, EndpointSummary } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listEndpoints: (): Promise<EndpointSummary[]> => fetch("/api/endpoints").then((res) => json<EndpointSummary[]>(res)),

  listChanges: (endpointId?: string): Promise<ContractChangeRecord[]> =>
    fetch(endpointId ? `/api/endpoints/${endpointId}/changes` : "/api/changes").then((res) =>
      json<ContractChangeRecord[]>(res),
    ),

  acknowledge: (endpointId: string, changeId: string): Promise<void> =>
    fetch(`/api/endpoints/${endpointId}/changes/${changeId}/ack`, { method: "POST" }).then(() => undefined),
};
