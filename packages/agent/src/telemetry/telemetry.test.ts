import assert from "node:assert/strict";
import { test } from "node:test";
import { telemetryStatus } from "./index.js";

/**
 * These assert the guards, because the cost of getting them wrong is sending
 * data from someone who did not agree. A silent regression here is a privacy
 * incident, not a bug.
 */

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("silent by default: an untouched install sends nothing", () => {
  withEnv({ DO_NOT_TRACK: undefined, SCHEMA_WATCH_TELEMETRY: undefined, CI: undefined }, () => {
    // No config file in a fresh environment means no decision, means no send.
    const status = telemetryStatus();
    if (!status.enabled) assert.equal(status.suppressedBecause, "not enabled");
  });
});

test("DO_NOT_TRACK wins over an explicit opt-in", () => {
  withEnv({ DO_NOT_TRACK: "1", SCHEMA_WATCH_TELEMETRY: "1", CI: undefined }, () => {
    assert.equal(telemetryStatus().suppressedBecause, "DO_NOT_TRACK is set");
  });
});

test("SCHEMA_WATCH_TELEMETRY=0 wins over an explicit opt-in", () => {
  withEnv({ DO_NOT_TRACK: undefined, SCHEMA_WATCH_TELEMETRY: "0", CI: undefined }, () => {
    assert.equal(telemetryStatus().suppressedBecause, "SCHEMA_WATCH_TELEMETRY is off");
  });
});

test("CI is tagged as ci, so pipeline runs are never counted as people", () => {
  withEnv({ CI: "true", DO_NOT_TRACK: undefined, SCHEMA_WATCH_TELEMETRY: "1" }, () => {
    assert.equal(telemetryStatus().environment, "ci");
  });
});

test("CI can opt in explicitly, since a runner has no home config to answer in", () => {
  withEnv({ CI: "true", DO_NOT_TRACK: undefined, SCHEMA_WATCH_TELEMETRY: "1" }, () => {
    assert.equal(telemetryStatus().suppressedBecause, null);
  });
});

test("a CI runner stays silent even if a local config says enabled", () => {
  // The realistic accident: a container built from a developer's machine, or a
  // mounted home directory, carrying an opt-in into a pipeline nobody chose to
  // instrument. The environment variable must be the only way in.
  withEnv({ CI: "true", DO_NOT_TRACK: undefined, SCHEMA_WATCH_TELEMETRY: undefined }, () => {
    assert.equal(telemetryStatus().suppressedBecause, "in CI without SCHEMA_WATCH_TELEMETRY=1");
  });
});
