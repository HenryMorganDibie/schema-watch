import { createHash, randomBytes } from "node:crypto";

/**
 * API keys (used by the CI check and the agent's optional sync mode) are
 * looked up by exact value on every request, so they're hashed with SHA-256
 * (deterministic, fast) rather than bcrypt (salted, meant to resist offline
 * cracking of a stolen hash but not designed for equality lookups). The
 * plaintext is shown to the user exactly once, at creation time.
 */
export function generateApiKey(): { plainText: string; hash: string } {
  const plainText = `sw_live_${randomBytes(24).toString("base64url")}`;
  return { plainText, hash: hashApiKey(plainText) };
}

export function hashApiKey(plainText: string): string {
  return createHash("sha256").update(plainText).digest("hex");
}
