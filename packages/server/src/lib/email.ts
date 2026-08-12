const RESEND_ENDPOINT = "https://api.resend.com/emails";

const APP_URL = process.env.APP_URL ?? "http://localhost:5174";
const FROM = process.env.EMAIL_FROM ?? "Schema-Watch <onboarding@resend.dev>";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

interface SendArgs {
  to: string;
  subject: string;
  heading: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  footer: string;
}

/**
 * Deliberately provider-shaped rather than provider-specific: everything above
 * this line is plain data, so swapping Resend for SES or Postmark is a change
 * to this one function.
 *
 * Errors are thrown, not swallowed, but callers decide whether a failure
 * should fail the whole request - signup, for example, should still succeed
 * if the mail provider is down.
 */
export async function sendEmail(args: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // In local development without a key, log the link so the flow is still
    // testable end to end instead of silently doing nothing.
    console.info(`[email] would send "${args.subject}" to ${args.to}: ${args.buttonUrl}`);
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [args.to],
      subject: args.subject,
      html: renderHtml(args),
      text: `${args.heading}\n\n${args.body}\n\n${args.buttonUrl}\n\n${args.footer}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export function sendVerificationEmail(to: string, token: string): Promise<void> {
  return sendEmail({
    to,
    subject: "Verify your Schema-Watch email",
    heading: "Confirm your email",
    body: "Click below to verify this address and unlock API keys, cloud sync, and billing.",
    buttonLabel: "Verify email",
    buttonUrl: `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`,
    footer: "This link expires in 24 hours. If you did not create a Schema-Watch account, ignore this email.",
  });
}

export function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  return sendEmail({
    to,
    subject: "Reset your Schema-Watch password",
    heading: "Reset your password",
    body: "Click below to choose a new password.",
    buttonLabel: "Reset password",
    buttonUrl: `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
    footer:
      "This link expires in 1 hour and can only be used once. If you did not request a reset, ignore this email - your password will not change.",
  });
}

function renderHtml(args: SendArgs): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f9f9f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0b0b0b">
    <table role="presentation" style="max-width:480px;margin:0 auto;background:#fff;border:1px solid rgba(11,11,11,.1);border-radius:12px">
      <tr><td style="padding:28px">
        <div style="font-weight:600;font-size:15px;margin-bottom:20px">Schema-Watch</div>
        <h1 style="font-size:19px;margin:0 0 10px">${escapeHtml(args.heading)}</h1>
        <p style="font-size:14px;line-height:1.55;color:#52514e;margin:0 0 22px">${escapeHtml(args.body)}</p>
        <a href="${escapeHtml(args.buttonUrl)}" style="display:inline-block;background:#2a78d6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(args.buttonLabel)}</a>
        <p style="font-size:12px;line-height:1.5;color:#898781;margin:22px 0 0">${escapeHtml(args.footer)}</p>
        <p style="font-size:12px;color:#898781;margin:12px 0 0;word-break:break-all">${escapeHtml(args.buttonUrl)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
