import type { ContractChangeView, EndpointView } from "@schema-watch/ui";

declare global {
  interface Window {
    __SCHEMA_WATCH_API__?: string;
  }
}

/**
 * In production this app is static files on a CDN while the API lives on
 * another host. The base URL is resolved at RUNTIME from /config.js rather
 * than baked in at build time, so pointing the app at a different API is a
 * one-line edit and redeploy of that file instead of a full rebuild. Falls
 * back to the build-time variable, then to same-origin (which is what dev
 * uses, where Vite proxies /api to localhost:4000).
 */
const API_BASE = window.__SCHEMA_WATCH_API__ || import.meta.env.VITE_API_URL || "";

const TOKEN_KEY = "schema-watch.token";
const REFRESH_KEY = "schema-watch.refresh";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setToken(token: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

/**
 * Access tokens now last fifteen minutes, so an open tab will routinely meet
 * a 401. One refresh is attempted and the request replayed; a failed refresh
 * means the session is genuinely gone, so the stored credentials are cleared
 * rather than left to fail forever.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // Several requests can 401 at once; they must share one rotation, or the
  // losers would present an already-rotated token and trip reuse detection.
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearToken();
        return false;
      }
      const body = await res.json();
      setToken(body.token, body.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await send(path, init, getToken());

  if (res.status === 401 && !path.startsWith("/api/auth/refresh")) {
    if (await refreshSession()) {
      res = await send(path, init, getToken());
    }
  }

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
  emailVerified: boolean;
  isPlatformAdmin: boolean;
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

export type Severity = "BREAKING" | "WARNING" | "INFO";

export interface IntegrationSummary {
  id: string;
  type: "SLACK" | "DISCORD";
  enabled: boolean;
  minSeverity: Severity;
  consecutiveFailures: number;
  lastError: string | null;
  lastDeliveryAt: string | null;
  webhookHost: string | null;
  createdAt: string;
}

export interface DeliveryRecord {
  id: string;
  status: "SUCCESS" | "FAILED";
  statusCode: number | null;
  summary: string;
  error: string | null;
  createdAt: string;
}

export interface BankAccount {
  currency: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  wireRouting?: string;
  achRouting?: string;
  accountType?: string;
  bankAddress?: string;
}

export interface BankTransfer {
  accounts: BankAccount[];
  contactEmail: string;
}

export interface BillingProviders {
  stripe: boolean;
  flutterwave: boolean;
  bankTransfer: BankTransfer | null;
  pricing: Record<string, { defaultCurrency: string; amounts: Record<string, number> }>;
}

export interface AdminTeam {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  billingProvider: string | null;
  projectCount: number;
  createdAt: string;
  members: { email: string; role: TeamRole; emailVerified: boolean }[];
}

export interface AnalyticsMetrics {
  totalUsers: number;
  activeUsers: number;
  projects: number;
  activeProjects: number;
  schemasCaptured: number;
  breakingChanges: number;
  ciChecks: number;
  mcpUsage: number | null;
}

export interface AnalyticsPoint {
  date: string;
  totalActivity: number;
  newUsers: number;
  newProjects: number;
  schemasCaptured: number;
  breakingChanges: number;
}

export interface TrafficPoint {
  date: string;
  count: number;
  uniques: number;
}

export interface ReferrerRow {
  referrer: string;
  count: number;
  uniques: number;
}

/**
 * Reported by GitHub, not measured by us. Kept as its own type so it is never
 * accidentally folded into the first-party numbers.
 */
export interface GitHubTraffic {
  available: boolean;
  reason: string | null;
  repo: string;
  retentionDays: number;
  views: { total: number; uniques: number; series: TrafficPoint[] } | null;
  clones: { total: number; uniques: number; series: TrafficPoint[] } | null;
  referrers: ReferrerRow[] | null;
  fetchedAt: string;
}

export interface RetentionCell {
  week: number;
  eligible: number;
  active: number | null;
  rate: number | null;
}

export interface RetentionCohort {
  cohortWeek: string;
  size: number;
  cells: RetentionCell[];
}

export interface RetentionSummary {
  cohorts: RetentionCohort[];
  weeks: number[];
  totalUsers: number;
}

export interface AnalyticsSummary {
  range: number;
  metrics: AnalyticsMetrics;
  series: AnalyticsPoint[];
  funnel: { label: string; count: number }[];
  recent: { id: string; occurredAt: string; eventName: string; actor: string; projectName: string | null }[];
}

export const api = {
  analyticsSummary: (range: number) => request<AnalyticsSummary>(`/api/admin/analytics/summary?range=${range}`),

  githubTraffic: () => request<GitHubTraffic>("/api/admin/analytics/github"),

  retention: () => request<RetentionSummary>("/api/admin/analytics/retention"),

  adminListTeams: () => request<AdminTeam[]>("/api/admin/teams"),

  adminSetPlan: (teamId: string, plan: Plan) =>
    request<{ id: string; plan: Plan }>(`/api/admin/teams/${teamId}/plan`, {
      method: "POST",
      body: JSON.stringify({ plan, manual: true }),
    }),

  verifyEmail: (token: string) =>
    request<{ verified: true }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),

  resendVerification: () => request<{ sent?: true; alreadyVerified?: true }>("/api/auth/verify-email/resend", { method: "POST" }),

  forgotPassword: (email: string) =>
    request<{ sent: true }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (token: string, password: string) =>
    request<{ token: string; refreshToken: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  logout: (refreshToken: string | null) =>
    request<void>("/api/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),

  listSessions: () =>
    request<{ id: string; userAgentLabel: string | null; lastUsedAt: string; createdAt: string; current: boolean }[]>(
      "/api/auth/sessions",
    ),

  revokeAllSessions: () => request<{ revoked: number }>("/api/auth/sessions/revoke-all", { method: "POST" }),

  signup: (email: string, password: string, name?: string) =>
    request<{ token: string; refreshToken: string; user: { id: string; email: string } }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; refreshToken: string; user: { id: string; email: string } }>("/api/auth/login", {
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

  listIntegrations: (projectId: string) =>
    request<IntegrationSummary[]>(`/api/projects/${projectId}/integrations`),

  addIntegration: (projectId: string, type: "SLACK" | "DISCORD", webhookUrl: string, minSeverity: Severity) =>
    request<IntegrationSummary>(`/api/projects/${projectId}/integrations`, {
      method: "POST",
      body: JSON.stringify({ type, webhookUrl, minSeverity }),
    }),

  testIntegration: (projectId: string, integrationId: string) =>
    request<{ delivered: true }>(`/api/projects/${projectId}/integrations/${integrationId}/test`, { method: "POST" }),

  updateIntegration: (projectId: string, integrationId: string, patch: { enabled?: boolean; minSeverity?: Severity }) =>
    request<IntegrationSummary>(`/api/projects/${projectId}/integrations/${integrationId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteIntegration: (projectId: string, integrationId: string) =>
    request<void>(`/api/projects/${projectId}/integrations/${integrationId}`, { method: "DELETE" }),

  listDeliveries: (projectId: string, integrationId: string) =>
    request<DeliveryRecord[]>(`/api/projects/${projectId}/integrations/${integrationId}/deliveries`),
};

export { API_BASE };
