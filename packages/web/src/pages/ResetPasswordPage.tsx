import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "@schema-watch/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (password !== confirm) return setError("Those passwords don't match.");
    if (!token) return setError("This link is missing its token.");

    setBusy(true);
    try {
      // A successful reset returns a fresh session, so the user lands straight
      // in the app rather than being asked to type the new password again.
      const { token: sessionToken } = await api.resetPassword(token, password);
      signIn(sessionToken);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card__brand">
          <Logo />
          <span>Schema-Watch</span>
        </div>
        <h1 className="auth-card__title">Choose a new password</h1>
        <p className="auth-card__subtitle">Pick something you have not used here before.</p>

        <div className="field">
          <label className="field__label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className="input"
            type="password"
            required
            autoFocus
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            className="input"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Set new password"}
        </button>

        <p className="auth-card__footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
