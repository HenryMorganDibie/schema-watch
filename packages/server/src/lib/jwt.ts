import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is not set");

export interface AuthTokenPayload {
  userId: string;
  /**
   * The user's tokenVersion at signing time. requireUser compares it against
   * the stored value, so bumping the stored version revokes every token
   * already issued. Without this a stolen JWT stays valid for its full 30
   * days even after the victim resets their password.
   */
  tokenVersion: number;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, SECRET!, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, SECRET!) as Partial<AuthTokenPayload>;
  if (typeof decoded.userId !== "string") throw new Error("malformed token");

  return {
    userId: decoded.userId,
    // Tokens issued before versioning existed carry no version; treat them as
    // version 0, which is the default for existing users, so nobody is logged
    // out by the upgrade itself.
    tokenVersion: typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0,
  };
}
