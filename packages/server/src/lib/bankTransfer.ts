export interface BankAccount {
  currency: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** US accounts only. */
  wireRouting?: string;
  achRouting?: string;
  accountType?: string;
  bankAddress?: string;
}

export interface BankTransferDetails {
  accounts: BankAccount[];
  /** Where the customer sends proof, so a plan can be granted promptly. */
  contactEmail: string;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Bank transfer as a payment method, for the period before a processor is
 * live. The customer transfers, emails proof, and the plan is granted from
 * the operator console.
 *
 * Details come from the environment, never from source: this repository is
 * public, and an account number committed to git is published permanently
 * and cannot be unpublished.
 *
 * Two accounts are supported so a customer can pay in their own currency.
 * The unprefixed variables are the local account; BANK_TRANSFER_USD_* adds a
 * second one for international payers.
 */
export function bankTransferDetails(): BankTransferDetails | null {
  const accounts: BankAccount[] = [];

  const localNumber = optional(process.env.BANK_TRANSFER_ACCOUNT_NUMBER);
  const localName = optional(process.env.BANK_TRANSFER_ACCOUNT_NAME);
  const localBank = optional(process.env.BANK_TRANSFER_BANK_NAME);
  if (localNumber && localName && localBank) {
    accounts.push({
      currency: optional(process.env.BANK_TRANSFER_CURRENCY) ?? "NGN",
      bankName: localBank,
      accountName: localName,
      accountNumber: localNumber,
    });
  }

  const usdNumber = optional(process.env.BANK_TRANSFER_USD_ACCOUNT_NUMBER);
  const usdName = optional(process.env.BANK_TRANSFER_USD_ACCOUNT_NAME);
  const usdBank = optional(process.env.BANK_TRANSFER_USD_BANK_NAME);
  if (usdNumber && usdName && usdBank) {
    accounts.push({
      currency: "USD",
      bankName: usdBank,
      accountName: usdName,
      accountNumber: usdNumber,
      wireRouting: optional(process.env.BANK_TRANSFER_USD_WIRE_ROUTING),
      achRouting: optional(process.env.BANK_TRANSFER_USD_ACH_ROUTING),
      accountType: optional(process.env.BANK_TRANSFER_USD_ACCOUNT_TYPE),
      bankAddress: optional(process.env.BANK_TRANSFER_USD_BANK_ADDRESS),
    });
  }

  if (accounts.length === 0) return null;

  return {
    accounts,
    contactEmail: optional(process.env.BANK_TRANSFER_CONTACT_EMAIL) ?? optional(process.env.EMAIL_FROM) ?? "",
  };
}

export function isBankTransferConfigured(): boolean {
  return bankTransferDetails() !== null;
}
