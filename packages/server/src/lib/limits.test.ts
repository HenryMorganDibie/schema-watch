import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_LIMITS, WARNING_THRESHOLD, currentPeriodStart, limitError, nextPeriodStart } from "./limits.js";

test("free tier is limited but usable, team tier is unmetered", () => {
  // A solo developer evaluating the product should not hit a wall; a team
  // using it seriously should.
  assert.equal(PLAN_LIMITS.FREE.projects, 1);
  assert.ok(PLAN_LIMITS.FREE.captures >= 1000, "free capture allowance should not be trivially small");
  assert.equal(PLAN_LIMITS.FREE.integrations, 0);

  assert.ok(PLAN_LIMITS.PRO.projects > PLAN_LIMITS.FREE.projects);
  assert.ok(PLAN_LIMITS.PRO.captures > PLAN_LIMITS.FREE.captures);

  assert.equal(PLAN_LIMITS.TEAM.projects, Infinity);
  assert.equal(PLAN_LIMITS.TEAM.captures, Infinity);
});

test("every plan defines every limit, so no resource is accidentally unmetered", () => {
  const keys = Object.keys(PLAN_LIMITS.FREE);
  for (const plan of ["FREE", "PRO", "TEAM"] as const) {
    for (const key of keys) {
      assert.notEqual(
        (PLAN_LIMITS[plan] as unknown as Record<string, number>)[key],
        undefined,
        `${plan} is missing a limit for ${key}`,
      );
    }
  }
});

test("limits increase monotonically as plans get more expensive", () => {
  for (const key of ["projects", "endpoints", "captures", "ciChecks", "historyDays"] as const) {
    assert.ok(PLAN_LIMITS.PRO[key] >= PLAN_LIMITS.FREE[key], `PRO.${key} should not be below FREE`);
    assert.ok(PLAN_LIMITS.TEAM[key] >= PLAN_LIMITS.PRO[key], `TEAM.${key} should not be below PRO`);
  }
});

test("the warning fires before the wall, not at it", () => {
  assert.ok(WARNING_THRESHOLD > 0 && WARNING_THRESHOLD < 1);
});

test("monthly counters reset at the start of the next month", () => {
  const mid = new Date(Date.UTC(2026, 7, 18, 13, 45));
  assert.equal(currentPeriodStart(mid).toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(nextPeriodStart(mid).toISOString(), "2026-09-01T00:00:00.000Z");

  // December must roll into the next year rather than month 13.
  const december = new Date(Date.UTC(2026, 11, 31, 23, 59));
  assert.equal(nextPeriodStart(december).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("a refusal is machine readable, so a CLI can explain itself", () => {
  const body = limitError("captures", {
    allowed: false,
    plan: "FREE",
    resetsAt: "2026-09-01T00:00:00.000Z",
    usage: { used: 5000, limit: 5000, remaining: 0, ratio: 1, warning: false, exceeded: true },
  });

  assert.equal(body.code, "USAGE_LIMIT_REACHED");
  assert.equal(body.limit.resource, "captures");
  assert.equal(body.limit.plan, "FREE");
  // The reset date is what tells a blocked user whether to wait or upgrade.
  assert.equal(body.limit.resetsAt, "2026-09-01T00:00:00.000Z");
});
