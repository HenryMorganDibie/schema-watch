import "./testEnv.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { hashRefreshToken, userAgentLabel } from "./session.js";
import { ACCESS_TOKEN_TTL, signAccessToken, verifyToken } from "./jwt.js";

const fakeReq = (ua?: string) => ({ headers: ua ? { "user-agent": ua } : {} }) as never;

test("refresh tokens are stored only as a hash", () => {
  const plain = "some-refresh-token";
  const hash = hashRefreshToken(plain);

  assert.notEqual(hash, plain);
  assert.equal(hash.length, 64, "sha-256 hex");
  // Deterministic, because lookup is by exact value.
  assert.equal(hashRefreshToken(plain), hash);
  assert.notEqual(hashRefreshToken("other"), hash);
});

test("access tokens are short-lived, not the old thirty days", () => {
  // The whole point of the split: a stolen access token expires quickly, and
  // the long-lived half is revocable because it has a database row.
  assert.equal(ACCESS_TOKEN_TTL, "15m");
});

test("access tokens carry the session so it can be revoked individually", () => {
  const token = signAccessToken({ userId: "user_1", tokenVersion: 3, sessionId: "sess_1" });
  const payload = verifyToken(token);

  assert.equal(payload.userId, "user_1");
  assert.equal(payload.tokenVersion, 3);
  assert.equal(payload.sessionId, "sess_1");
});

test("a token minted before sessions existed still verifies", () => {
  // Shipping sessions must not sign existing users out.
  const legacy = signAccessToken({ userId: "user_1", tokenVersion: 0 } as never);
  const payload = verifyToken(legacy);

  assert.equal(payload.sessionId, undefined);
  assert.equal(payload.tokenVersion, 0);
});

test("a tampered token is rejected", () => {
  const token = signAccessToken({ userId: "user_1", tokenVersion: 0, sessionId: "s" });
  const tampered = token.slice(0, -3) + "aaa";
  assert.throws(() => verifyToken(tampered));
});

test("the session label is coarse and carries no fingerprint", () => {
  const label = userAgentLabel(
    fakeReq("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"),
  );
  assert.equal(label, "Chrome on Windows");

  // Nothing version-specific or uniquely identifying survives.
  assert.ok(!label!.includes("151"));
  assert.ok(!label!.includes("537.36"));
  assert.equal(userAgentLabel(fakeReq()), null);
});
