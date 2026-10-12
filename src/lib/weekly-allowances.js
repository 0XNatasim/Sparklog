// Per-employee weekly non-taxable allowances, set in Configuration › Règles de temps. Each is paid
// once per worked CCQ week and stays outside the DAS calculation: it only adds to the amount paid.
export const DEFAULT_STORAGE_AMOUNT = 50;

export function weeklyPhoneAmount(profile) {
  return Math.max(0, Number(profile?.phone_data_reimbursement) || 0);
}

// Storage is paid only when the employee's storage_compensation flag is on.
export function weeklyStorageAmount(profile) {
  if (!profile?.storage_compensation) return 0;
  const amount = profile.storage_compensation_amount;
  return Math.max(0, amount == null || amount === "" ? DEFAULT_STORAGE_AMOUNT : Number(amount) || 0);
}
