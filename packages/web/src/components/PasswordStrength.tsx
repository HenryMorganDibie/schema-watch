export const MIN_PASSWORD_LENGTH = 10;

/**
 * Mirrors packages/server/src/lib/passwordPolicy.ts. The server is the
 * authority; this exists so the user sees the requirements while typing
 * instead of discovering them from a rejected submit.
 */
export const PASSWORD_RULES = [
  { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p: string) => p.length >= MIN_PASSWORD_LENGTH },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "digit", label: "A number", test: (p: string) => /\d/.test(p) },
  { id: "symbol", label: "A symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const passed = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const ratio = passed / PASSWORD_RULES.length;
  const tone = ratio === 1 ? "strong" : ratio >= 0.6 ? "medium" : "weak";

  return (
    <div className="pw-strength">
      <div className={`pw-strength__bar pw-strength__bar--${tone}`}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <ul className="pw-strength__rules">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} className={ok ? "is-met" : undefined}>
              {/* The tick is not the only signal: met rules also change colour
                  and the text stays readable either way. */}
              <span aria-hidden="true">{ok ? "✓" : "·"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
