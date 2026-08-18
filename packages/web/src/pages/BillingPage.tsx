import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type Plan } from "../lib/api";
import { useActiveTeam } from "../lib/useActiveTeam";

const PLAN_FEATURES: Record<string, string[]> = {
  FREE: ["Local monitoring, unlimited endpoints", "7 days of cloud history", "1 project"],
  PRO: ["Unlimited cloud history", "Unlimited projects", "Slack and Discord alerts", "CI gate on 1 repo"],
  TEAM: ["Everything in Pro", "Unlimited repos in CI", "Team seats and shared dashboards", "Audit history"],
};

function formatPrice(currency: string, amount: number): string {
  if (currency === "NGN") return `₦${amount.toLocaleString()}`;
  if (currency === "USD") return `$${amount}`;
  return `${amount} ${currency}`;
}

export function BillingPage() {
  const { activeTeam } = useActiveTeam();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");

  const { data: providers, isLoading } = useQuery({ queryKey: ["billing-providers"], queryFn: api.billingProviders });

  if (!activeTeam) return <div className="page">Create a team first.</div>;
  if (isLoading) return <div className="spinner-note">Loading plans...</div>;

  const isOwner = activeTeam.role === "OWNER";
  const nothingConfigured = providers && !providers.stripe && !providers.flutterwave && !providers.bankTransfer;

  async function startCheckout(plan: "PRO" | "TEAM", provider: "stripe" | "flutterwave") {
    setError(null);
    setPending(`${plan}-${provider}`);
    try {
      const result =
        provider === "stripe"
          ? await api.stripeCheckout(activeTeam!.id, plan)
          : await api.flutterwaveCheckout(activeTeam!.id, plan, currency);
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setPending(null);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__title">Billing</div>
          <div className="page__subtitle">
            {activeTeam.name} is on the {activeTeam.plan} plan.
          </div>
        </div>
        {providers?.flutterwave && (
          <select
            className="input"
            style={{ width: "auto" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="NGN">NGN</option>
          </select>
        )}
      </div>

      {currency === "NGN" && providers?.stripe && (
        <div className="notice">Naira is billed through Flutterwave. Switch to USD to pay by international card.</div>
      )}

      {error && <div className="alert">{error}</div>}
      {!isOwner && <div className="alert">Only the team owner can change billing.</div>}
      {nothingConfigured && (
        <div className="alert">
          No payment provider is configured on this server, so upgrades are disabled. Set FLUTTERWAVE_SECRET_KEY or
          STRIPE_SECRET_KEY on the API.
        </div>
      )}

      {providers?.bankTransfer && (
        <div className="bank-transfer">
          <div className="bank-transfer__title">Pay by bank transfer</div>
          <p className="bank-transfer__intro">
            Transfer the plan amount to whichever account matches your currency, then email proof and your team name.
            Your plan is activated by hand, usually within a day.
          </p>

          {providers.bankTransfer.accounts.map((account) => (
            <div className="bank-account" key={account.currency}>
              <div className="bank-account__currency">Pay in {account.currency}</div>
              <dl className="bank-transfer__details">
                <div>
                  <dt>Bank</dt>
                  <dd>{account.bankName}</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd className="mono">{account.accountNumber}</dd>
                </div>
                <div>
                  <dt>Account name</dt>
                  <dd>{account.accountName}</dd>
                </div>
                {account.accountType && (
                  <div>
                    <dt>Account type</dt>
                    <dd>{account.accountType}</dd>
                  </div>
                )}
                {account.wireRouting && (
                  <div>
                    <dt>Wire routing</dt>
                    <dd className="mono">{account.wireRouting}</dd>
                  </div>
                )}
                {account.achRouting && (
                  <div>
                    <dt>ACH routing</dt>
                    <dd className="mono">{account.achRouting}</dd>
                  </div>
                )}
                {account.bankAddress && (
                  <div>
                    <dt>Bank address</dt>
                    <dd>{account.bankAddress}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}

          {providers.bankTransfer.contactEmail && (
            <p className="bank-transfer__note">
              Send proof to <strong>{providers.bankTransfer.contactEmail}</strong>, and include your team name{" "}
              <strong>{activeTeam.name}</strong> in the transfer narration so it can be matched.
            </p>
          )}
        </div>
      )}

      <div className="plan-grid">
        {(["FREE", "PRO", "TEAM"] as Plan[]).map((plan) => {
          const pricing = providers?.pricing[plan];
          const amount = pricing?.amounts[currency];
          const isCurrent = activeTeam.plan === plan;

          return (
            <div key={plan} className={`plan-card ${isCurrent ? "plan-card--current" : ""}`}>
              <div className="plan-card__name">{plan}</div>
              <div className="plan-card__price">
                {plan === "FREE" ? "Free" : amount !== undefined ? formatPrice(currency, amount) : "-"}
                {plan !== "FREE" && <span className="plan-card__period"> /mo</span>}
              </div>

              <ul className="plan-card__features">
                {PLAN_FEATURES[plan]!.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              {isCurrent ? (
                <button className="button button--secondary" disabled>
                  Current plan
                </button>
              ) : plan === "FREE" ? (
                <button className="button button--secondary" disabled>
                  Included
                </button>
              ) : (
                <div className="provider-row">
                  {providers?.flutterwave && (
                    <button
                      className="button button--sm"
                      disabled={!isOwner || pending !== null}
                      onClick={() => startCheckout(plan as "PRO" | "TEAM", "flutterwave")}
                    >
                      {pending === `${plan}-flutterwave` ? "Redirecting..." : "Pay with Flutterwave"}
                    </button>
                  )}
                  {/* Stripe charges a fixed USD price id, so offering it while
                      NGN prices are on screen would show one amount and bill
                      another. Naira goes through Flutterwave only. */}
                  {providers?.stripe && currency === "USD" && (
                    <button
                      className="button button--sm button--secondary"
                      disabled={!isOwner || pending !== null}
                      onClick={() => startCheckout(plan as "PRO" | "TEAM", "stripe")}
                    >
                      {pending === `${plan}-stripe` ? "Redirecting..." : "Pay with card"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
