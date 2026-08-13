/**
 * Platform admins are you, the operator, not team owners.
 *
 * Membership is read from an environment variable rather than a database
 * column on purpose: nothing that can write to the database - a bug in
 * signup, a stray migration, a compromised account - can promote itself to
 * admin. Changing who is an admin requires access to the deployment.
 */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = platformAdminEmails();
  // With no admins configured the admin surface stays closed, rather than
  // defaulting open.
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}
