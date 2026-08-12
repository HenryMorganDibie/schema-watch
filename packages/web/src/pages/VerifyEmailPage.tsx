import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Logo } from "@schema-watch/ui";
import { api, ApiError } from "../lib/api";

type State = { status: "working" } | { status: "done" } | { status: "failed"; message: string };

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ status: "working" });

  // React 18 StrictMode mounts effects twice in development. The token is
  // single-use, so without this guard the second run always reports failure
  // on a link that actually worked.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState({ status: "failed", message: "This link is missing its token." });
      return;
    }

    api
      .verifyEmail(token)
      .then(() => setState({ status: "done" }))
      .catch((err) =>
        setState({
          status: "failed",
          message: err instanceof ApiError ? err.message : "Something went wrong verifying this link.",
        }),
      );
  }, [token]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-card__brand">
          <Logo />
          <span>Schema-Watch</span>
        </div>

        {state.status === "working" && <p className="auth-card__subtitle">Verifying your email...</p>}

        {state.status === "done" && (
          <>
            <h1 className="auth-card__title">Email verified</h1>
            <p className="auth-card__subtitle">
              Your address is confirmed. API keys, cloud sync, and billing are now unlocked.
            </p>
            <Link className="button button--block" to="/">
              Continue
            </Link>
          </>
        )}

        {state.status === "failed" && (
          <>
            <h1 className="auth-card__title">Link didn't work</h1>
            <p className="auth-card__subtitle">{state.message}</p>
            <p className="auth-card__subtitle">
              Verification links expire after 24 hours and can only be used once. Sign in and request a new one.
            </p>
            <Link className="button button--block" to="/login">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
