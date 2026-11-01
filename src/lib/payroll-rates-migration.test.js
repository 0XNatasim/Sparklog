import { readFileSync, readdirSync } from "node:fs";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { describe, expect, it, vi } from "vitest";
import { PAYROLL_RATE_DEFS } from "./payroll-rates.js";
import { PAYROLL_RATE_KEYS } from "../payroll/ccq-benefits.js";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const file = readdirSync(dir).find((f) => f.includes("_0130_payroll_rates"));
const sql = readFileSync(new URL(file, dir), "utf8");

describe("migration 0130 payroll_rates", () => {
  it("allows exactly the keys the code knows, with the same maximum", () => {
    for (const key of PAYROLL_RATE_KEYS) expect(sql, key).toContain(`'${key}'`);
    expect(PAYROLL_RATE_DEFS.map((d) => d.key).sort()).toEqual([...PAYROLL_RATE_KEYS].sort());
    for (const d of PAYROLL_RATE_DEFS) {
      const m = sql.match(new RegExp(`when '${d.key}' then ([0-9.]+)`));
      expect(Number(m?.[1]), d.key).toBe(d.max);
    }
  });
  it("lets only the owner write, through audited functions", () => {
    expect(sql).toContain("public.is_privileged()");
    expect(sql.match(/payroll_rate_set|payroll_rate_deleted/g)).toHaveLength(2);
    expect(sql).not.toMatch(/create policy "payroll_rates: [^"]*" on public.payroll_rates\s+for (insert|update|delete)/);
    expect(sql).toContain("get_my_role() = 'manager'");
  });
});
