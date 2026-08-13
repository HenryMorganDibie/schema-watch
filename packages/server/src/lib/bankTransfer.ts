export interface BankTransferDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  /** Where the customer sends proof, so a plan can be granted promptly. */
  contactEmail: string;
  currency: string;
}

/**
 * Bank transfer as a payment method, for the period before a processor is
 * live. The customer transfers, emails proof, and the plan is granted from
 * the operator console.
 *
 * Details come from the environment, never from source: this repository is
 * public, and an account number committed to git is published permanently
 * and cannot be unpublished.
 */
export function bankTransferDetails(): BankTransferDetails | null {
  const accountNumber = process.env.BANK_TRANSFER_ACCOUNT_NUMBER;
  const accountName = process.env.BANK_TRANSFER_ACCOUNT_NAME;
  const bankName = process.env.BANK_TRANSFER_BANK_NAME;

  if (!accountNumber || !accountName || !bankName) return null;

  return {
    accountName,
    accountNumber,
    bankName,
    contactEmail: process.env.BANK_TRANSFER_CONTACT_EMAIL ?? process.env.EMAIL_FROM ?? "",
    currency: process.env.BANK_TRANSFER_CURRENCY ?? "NGN",
  };
}

export function isBankTransferConfigured(): boolean {
  return bankTransferDetails() !== null;
}
