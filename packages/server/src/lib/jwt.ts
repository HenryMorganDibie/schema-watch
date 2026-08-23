import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is not set");

/**
 * Access tokens are deliberately short-lived.
 *
 * They are stateless, so the only thing bounding a stolen one is its expiry.
 * Fifteen minutes keeps the blast radius small while the refresh token - which
 * IS revocable, because it has a database row - carries the long-lived
 * session. Before this split a stolen token was valid for thirty days and
 * logout could not revoke it.
 */
const ACCESS_TTL = "15m";

export interface AuthTokenPayload {
  userId: string;
  /**
   * The user's tokenVersion at signing time. requireUser compares it against
   * the stored value, so bumping the stored version revokes every token
   * already issued - used by password reset.
   */
  tokenVersion: number;
  /**
   * The session this token belongs to. Lets a single session be revoked
   * without disturbing the user's other devices; absent on tokens issued
   * before sessions existed, which are then treated as unbound.
   */
  sessionId?: string;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, SECRET!, { expiresIn: ACCESS_TTL });
}

/** Retained under the old name so existing callers keep working. */
export const signToken = signAccessToken;

export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, SECRET!) as Partial<AuthTokenPayload>;
  if (typeof decoded.userId !== "string") throw new Error("malformed token");

  return {
    userId: decoded.userId,
    // Tokens issued before versioning existed carry no version; treat them as
    // version 0, which is the default for existing users, so nobody is logged
    // out by the upgrade itself.
    tokenVersion: typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0,
    sessionId: typeof decoded.sessionId === "string" ? decoded.sessionId : undefined,
  };
}

export const ACCESS_TOKEN_TTL = ACCESS_TTL;
