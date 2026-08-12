import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@schema-watch/ui";
import { api } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // The endpoint reports success even for unknown addresses, so this never
    // reveals whether an account exists. Treat any outcome the same way.
    try {
      await api.forgotPassword(email);
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-card__brand">
            <Logo />
            <span>Schema-Watch</span>
          </div>
          <h1 className="auth-card__title">Check your inbox</h1>
          <p className="auth-card__subtitle">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in an hour.
          </p>
          <Link className="button button--block" to="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card__brand">
          <Logo />
          <span>Schema-Watch</span>
        </div>
        <h1 className="auth-card__title">Reset your password</h1>
        <p className="auth-card__subtitle">We'll email you a link to choose a new one.</p>

        <div className="field">
          <label className="field__label" htmlFor="reset-email">
            Email
          </label>
          <input
            id="reset-email"
            className="input"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send reset link"}
        </button>

        <p className="auth-card__footer">
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
