import { describe, expect, it } from "vitest";
import { DEFAULT_STORAGE_AMOUNT, weeklyPhoneAmount, weeklyStorageAmount } from "./weekly-allowances";

describe("weekly allowances", () => {
  it("pays storage only when the flag is on, at the employee's amount", () => {
    expect(weeklyStorageAmount({ storage_compensation: false, storage_compensation_amount: 50 })).toBe(0);
    expect(weeklyStorageAmount({ storage_compensation: true, storage_compensation_amount: 75 })).toBe(75);
    expect(weeklyStorageAmount({ storage_compensation: true, storage_compensation_amount: 0 })).toBe(0);
    expect(weeklyStorageAmount({ storage_compensation: true })).toBe(DEFAULT_STORAGE_AMOUNT);
  });

  it("reads the phone-data amount and never goes negative", () => {
    expect(weeklyPhoneAmount({ phone_data_reimbursement: 7 })).toBe(7);
    expect(weeklyPhoneAmount({ phone_data_reimbursement: null })).toBe(0);
    expect(weeklyPhoneAmount({ phone_data_reimbursement: -3 })).toBe(0);
  });
});
