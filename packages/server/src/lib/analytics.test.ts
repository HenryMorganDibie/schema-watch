import assert from "node:assert/strict";
import { test } from "node:test";
import { ANALYTICS_EVENTS, CLIENT_EVENTS, referrerHostOf } from "./analytics.js";

test("only anonymous website events may be submitted by a browser", () => {
  // A visitor must not be able to forge a login or inflate CI usage; those
  // are recorded server-side where they actually happen.
  assert.ok(CLIENT_EVENTS.includes("page_view"));
  assert.ok(CLIENT_EVENTS.includes("try_cloud_clicked"));
  assert.ok(CLIENT_EVENTS.includes("signup_started"));

  assert.ok(!CLIENT_EVENTS.includes("login"));
  assert.ok(!CLIENT_EVENTS.includes("ci_check_run"));
  assert.ok(!CLIENT_EVENTS.includes("agent_connected"));
  assert.ok(!CLIENT_EVENTS.includes("email_verification_completed"));
});

test("every client event is a known event", () => {
  for (const name of CLIENT_EVENTS) {
    assert.ok((ANALYTICS_EVENTS as readonly string[]).includes(name), `${name} is not a known event`);
  }
});

test("nothing already derivable from another table is recorded as an event", () => {
  // Users, projects, snapshots and contract changes are counted from their
  // own tables. Recording them here too would create two sources of truth.
  const derivable = ["signup_completed", "project_created", "api_key_created", "schema_captured", "breaking_change_detected"];
  for (const name of derivable) {
    assert.ok(!(ANALYTICS_EVENTS as readonly string[]).includes(name), `${name} should be derived, not recorded`);
  }
});

test("only the referrer host is kept, never the full URL", () => {
  // A full referrer can carry paths, query strings and tokens; the host alone
  // answers "did anyone arrive from LinkedIn".
  assert.equal(referrerHostOf("https://www.linkedin.com/feed/update/123?token=secret"), "www.linkedin.com");
  assert.equal(referrerHostOf("https://github.com/HenryMorganDibie/schema-watch"), "github.com");
  assert.equal(referrerHostOf(undefined), null);
  assert.equal(referrerHostOf("not-a-url"), null);
});
