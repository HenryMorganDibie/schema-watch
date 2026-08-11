import type { ContractChangeView, EndpointView } from "@schema-watch/ui";

/**
 * In production this app is static files on a CDN while the API lives on
 * another host, so the base URL is baked in at build time. In dev it stays
 * empty and Vite proxies /api to localhost:4000.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "schema-watch.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `${res.status} ${res.statusText}`);
  }
  return body as T;
}

export interface Me {
  id: string;
  email: string;
  name: string | null;
  teams: { id: string; name: string; slug: string; plan: Plan; role: TeamRole }[];
}

export type Plan = "FREE" | "PRO" | "TEAM";
export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

export interface Project {
  id: string;
  name: string;
  slug: string;
  teamId: string;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface BillingProviders {
  stripe: boolean;
  flutterwave: boolean;
  pricing: Record<string, { defaultCurrency: string; amounts: Record<string, number> }>;
}

export const api = {
  signup: (email: string, password: string, name?: string) =>
    request<{ token: string; user: { id: string; email: string } }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<Me>("/api/auth/me"),

  createTeam: (name: string) => request<{ id: string; name: string; slug: string }>("/api/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  }),

  addMember: (teamId: string, email: string, role: "ADMIN" | "MEMBER") =>
    request(`/api/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),

  listProjects: (teamId: string) => request<Project[]>(`/api/teams/${teamId}/projects`),

  createProject: (teamId: string, name: string) =>
    request<Project>(`/api/teams/${teamId}/projects`, { method: "POST", body: JSON.stringify({ name }) }),

  listEndpoints: (projectId: string) => request<EndpointView[]>(`/api/projects/${projectId}/endpoints`),

  listChanges: (endpointId: string) => request<ContractChangeView[]>(`/api/endpoints/${endpointId}/changes`),

  listApiKeys: (teamId: string) => request<ApiKeySummary[]>(`/api/teams/${teamId}/api-keys`),

  createApiKey: (teamId: string, label: string) =>
    request<{ id: string; label: string; key: string }>(`/api/teams/${teamId}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ label }),
    }),

  billingProviders: () => request<BillingProviders>("/api/billing/providers"),

  stripeCheckout: (teamId: string, plan: "PRO" | "TEAM") =>
    request<{ url: string }>("/api/billing/stripe/checkout-session", {
      method: "POST",
      body: JSON.stringify({ teamId, plan }),
    }),

  flutterwaveCheckout: (teamId: string, plan: "PRO" | "TEAM", currency: string) =>
    request<{ url: string }>("/api/billing/flutterwave/checkout", {
      method: "POST",
      body: JSON.stringify({ teamId, plan, currency }),
    }),

  addIntegration: (projectId: string, webhookUrl: string, type: "SLACK" | "DISCORD") =>
    request(`/api/projects/${projectId}/integrations`, {
      method: "POST",
      body: JSON.stringify({ type, webhookUrl }),
    }),
};

export { API_BASE };
