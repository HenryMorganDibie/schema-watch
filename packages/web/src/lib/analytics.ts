import { API_BASE, getToken } from "./api";

const VISITOR_KEY = "schema-watch.visitor";
const SESSION_KEY = "schema-watch.session";
const TRY_CLOUD_KEY = "schema-watch.try-cloud-sent";

export type ClientEvent = "page_view" | "try_cloud_clicked" | "signup_started" | "email_verification_started";

/**
 * A random identifier in localStorage, used only to tell one visitor from
 * another. No browser or device fingerprinting: clearing site data makes a
 * visitor genuinely new, which is the behaviour a person expects.
 */
function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Private mode or blocked storage: the event still counts, just without
    // being attributable to a returning visitor.
    return "";
  }
}

/** Session scope, so a return visit next week is a separate session. */
function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/**
 * Never rejects and never blocks the UI. Telemetry failing, being blocked by
 * an ad blocker, or being offline must not affect the page.
 */
export function track(eventName: ClientEvent, route?: string): void {
  const token = getToken();

  void fetch(`${API_BASE}/api/analytics/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      eventName,
      anonymousVisitorId: visitorId(),
      sessionId: sessionId(),
      route: route ?? window.location.pathname,
    }),
    // Best effort: this must never delay navigation.
    keepalive: true,
  }).catch(() => {});
}

/**
 * Arriving from another site is the "clicked through from my post" signal,
 * which is the top of the funnel. Fired once per session so a refresh does
 * not inflate it, and only for external referrers - internal navigation is
 * already covered by page_view.
 */
export function trackArrival(): void {
  track("page_view");

  try {
    if (sessionStorage.getItem(TRY_CLOUD_KEY)) return;
    const referrer = document.referrer;
    if (!referrer) return;

    const from = new URL(referrer).host;
    if (from && from !== window.location.host) {
      sessionStorage.setItem(TRY_CLOUD_KEY, "1");
      track("try_cloud_clicked");
    }
  } catch {
    // A malformed referrer just means no arrival event.
  }
}
