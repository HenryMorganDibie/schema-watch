import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * Persistent nudge for unverified accounts. Browsing is deliberately allowed,
 * so this is the only thing telling a new user why API keys and billing are
 * refusing them.
 */
export function VerifyBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setState("sending");
    try {
      await api.resendVerification();
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="verify-banner">
      <span className="verify-banner__dot" />
      <span className="verify-banner__text">
        Confirm <strong>{user.email}</strong> to unlock API keys, cloud sync, and billing.
      </span>
      {state === "sent" ? (
        <span className="verify-banner__sent">Link sent - check your inbox</span>
      ) : (
        <button className="verify-banner__action" onClick={resend} disabled={state === "sending"}>
          {state === "sending" ? "Sending..." : state === "failed" ? "Try again" : "Resend email"}
        </button>
      )}
    </div>
  );
}
