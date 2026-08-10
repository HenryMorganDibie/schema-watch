import http from "node:http";

/**
 * A deliberately misbehaving backend for the demo: it serves a stable
 * contract for a few seconds, then "ships a backend change" that breaks the
 * frontend, exactly like the scenario Schema-Watch exists to catch.
 *
 * Stage 0 is the baseline every endpoint starts at. Stage 1 is what a
 * careless backend deploy looks like.
 */
const PORT = Number(process.env.DEMO_API_PORT ?? 4570);

let stage = 0;

const ENDPOINTS = {
  "/api/users/42": [
    { userId: "usr_8a12f", name: "Ada Lovelace", email: "ada@example.com", verified: true },
    // userId silently becomes a number: the classic contract break
    { userId: 42, name: "Ada Lovelace", email: "ada@example.com", verified: true },
  ],
  "/api/orders/1001": [
    { orderId: 1001, total: 49.99, currency: "USD", customer: { id: 7, tier: "gold" } },
    // total becomes a string: every price calculation downstream breaks
    { orderId: 1001, total: "49.99", currency: "USD", customer: { id: 7, tier: "gold" } },
  ],
  "/api/session": [
    { token: "tok_live_9f", expiresAt: "2026-09-01T00:00:00Z", user: { id: 3, role: "admin" } },
    // user goes null: the classic "cannot read property of null" crash
    { token: "tok_live_9f", expiresAt: "2026-09-01T00:00:00Z", user: null },
  ],
  "/api/projects": [
    { items: [{ id: 1, title: "Apollo", ownerId: 3 }], nextCursor: "eyJpZCI6MX0" },
    // a new optional field: safe, and Schema-Watch should NOT cry wolf
    { items: [{ id: 1, title: "Apollo", ownerId: 3, archived: false }], nextCursor: "eyJpZCI6MX0" },
  ],
};

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0];
  const variants = ENDPOINTS[pathname];

  res.writeHead(variants ? 200 : 404, { "content-type": "application/json" });
  if (!variants) return res.end(JSON.stringify({ error: "not found" }));

  // Values jitter on every request; only the SHAPE changes at stage 1. This
  // is the point of the demo: a noisy payload never fires an alert.
  const body = structuredClone(variants[Math.min(stage, variants.length - 1)]);
  if ("token" in body) body.requestedAt = new Date().toISOString();

  res.end(JSON.stringify(body));
});

server.listen(PORT, () => {
  console.log(`[demo api] listening on http://localhost:${PORT} (stage 0: stable contract)`);
});

export function advanceStage() {
  stage = 1;
}

// Ship the "bad backend deploy" a few seconds in, so the dashboard is already
// open and the viewer sees the alerts arrive live.
setTimeout(() => {
  stage = 1;
  console.log("[demo api] >>> backend team just shipped a breaking change <<<");
}, Number(process.env.DEMO_BREAK_AFTER_MS ?? 9000));
