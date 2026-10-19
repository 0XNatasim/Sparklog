import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isValidSin } from "./sin";

const vaultMigration = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261019120000_0102_nas_encrypted_in_vault.sql",
  import.meta.url
)), "utf8");

describe("isValidSin (Luhn, same rule as public.sin_is_valid)", () => {
  it("accepts numbers with a valid check digit", () => {
    expect(isValidSin("046454286")).toBe(true); // CRA's published sample
    expect(isValidSin("130692544")).toBe(true);
  });

  it("rejects a wrong check digit, a wrong length and non-digits", () => {
    expect(isValidSin("046454287")).toBe(false);
    expect(isValidSin("123456789")).toBe(false);
    expect(isValidSin("12345678")).toBe(false);
    expect(isValidSin("0464542860")).toBe(false);
    expect(isValidSin("04645428a")).toBe(false);
    expect(isValidSin("046 454 286")).toBe(false); // the field strips spaces before checking
    expect(isValidSin(null)).toBe(false);
  });

  it("matches the server rule: set_nas rejects the same numbers with « invalid_nas »", () => {
    expect(vaultMigration).toContain("function public.sin_is_valid(p_sin text)");
    expect(vaultMigration).toContain("when i % 2 = 0 then"); // SQL is 1-based: positions 2, 4, 6, 8 doubled
    expect(vaultMigration).toContain("if clean is not null and not public.sin_is_valid(clean) then");
    expect(vaultMigration).toContain("message = 'invalid_nas'");
  });
});
