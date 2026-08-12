import { createHash, randomBytes } from "node:crypto";
import type { TokenPurpose } from "@prisma/client";
import { prisma } from "./prisma.js";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // a day: people check email late
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // an hour: a live account-takeover path

export function hashToken(plainText: string): string {
  return createHash("sha256").update(plainText).digest("hex");
}

/**
 * Issues a single-use token and returns the plaintext, which is emailed and
 * never stored. Any earlier unused token for the same purpose is consumed
 * first, so a freshly requested link always invalidates the previous one.
 */
export async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
  await prisma.verificationToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  const plainText = randomBytes(32).toString("base64url");
  const ttl = purpose === "PASSWORD_RESET" ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFY_TTL_MS;

  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(plainText),
      purpose,
      userId,
      expiresAt: new Date(Date.now() + ttl),
    },
  });

  return plainText;
}

export interface ConsumedToken {
  userId: string;
}

/**
 * Validates and burns a token in one step. Returns null for anything not
 * usable - unknown, wrong purpose, already used, or expired - so callers
 * cannot accidentally distinguish those cases for an attacker.
 */
export async function consumeToken(plainText: string, purpose: TokenPurpose): Promise<ConsumedToken | null> {
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(plainText) } });

  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }

  // Guard against a token being redeemed twice by concurrent requests: the
  // update only matches while usedAt is still null, so the loser sees count 0.
  const claimed = await prisma.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return { userId: record.userId };
}
