export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Deliberately modest: length does far more for real-world strength than
 * character-class rules, which mostly push people toward "Password1!" and a
 * sticky note. Length is the first rule and the longest bar; the classes stop
 * the worst offenders without making the form hostile.
 *
 * Exported as data so the signup form can render the exact same checklist the
 * server enforces, instead of the two drifting apart.
 */
export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "A number", test: (p) => /\d/.test(p) },
  { id: "symbol", label: "A symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Blocking the handful of passwords that dominate credential-stuffing lists is
// worth more than another character-class rule.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "letmein123",
  "welcome123",
  "admin123",
  "iloveyou",
  "changeme",
  "schemawatch",
]);

// Checked after stripping symbols and any trailing digits, so "Password123!",
// "qwerty2024" and friends are caught by their stem rather than needing an
// entry per variation.
const COMMON_WORDS = new Set([
  "password",
  "passw",
  "qwerty",
  "qwertyuiop",
  "letmein",
  "welcome",
  "admin",
  "administrator",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "trustno",
  "changeme",
  "schemawatch",
]);

export interface PasswordCheck {
  ok: boolean;
  /** First human-readable reason it failed, suitable for an API error. */
  reason?: string;
}

export function checkPassword(password: string, email?: string): PasswordCheck {
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  if (failed) return { ok: false, reason: `Password needs: ${failed.label.toLowerCase()}` };

  // Compare against the blocklist with decoration stripped, otherwise the
  // character-class rules above just teach people to write "Password123!" -
  // which passes every rule and is one of the most guessed strings there is.
  const normalized = password.toLowerCase();
  const stripped = normalized.replace(/[^a-z0-9]/g, "");
  const base = stripped.replace(/\d+$/, "");

  if (COMMON_PASSWORDS.has(normalized) || COMMON_PASSWORDS.has(stripped) || COMMON_WORDS.has(base)) {
    return { ok: false, reason: "That password is too common, pick something less guessable" };
  }

  // A password containing the local part of the address is trivially guessable
  // for anyone who knows the account.
  const localPart = email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && normalized.includes(localPart)) {
    return { ok: false, reason: "Password should not contain your email address" };
  }

  return { ok: true };
}
