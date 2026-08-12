import { Logo } from "@schema-watch/ui";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = isSignup ? await api.signup(email, password, name || undefined) : await api.login(email, password);
      signIn(result.token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-card__brand">
          <Logo size={22} />
          <span>Schema-Watch</span>
        </div>

        <div className="auth-card__title">{isSignup ? "Create your account" : "Sign in"}</div>
        <div className="auth-card__subtitle">
          {isSignup
            ? "Cloud history, team dashboards, Slack alerts, and the CI gate. The local proxy stays free forever."
            : "Welcome back."}
        </div>

        {error && <div className="alert">{error}</div>}

        {isSignup && (
          <div className="field">
            <label className="field__label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
            />
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? "At least 8 characters" : ""}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </div>

        <button className="button button--block" type="submit" disabled={submitting}>
          {submitting ? "Working..." : isSignup ? "Create account" : "Sign in"}
        </button>

        <div className="auth-card__footer">
          {isSignup ? (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/signup">Create an account</Link>
              <br />
              <Link to="/forgot-password">Forgot your password?</Link>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
