import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULE_SECTIONS } from "../payroll/rules/rule-overrides.js";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const sql = readFileSync(new URL(readdirSync(dir).find((f) => f.includes("_0131_statutory_rate_sets")), dir), "utf8");

describe("migration 0131 statutory_rate_sets", () => {
  it("accepts exactly the sections the payroll code reads", () => {
    for (const key of RULE_SECTIONS) expect(sql, key).toContain(`'${key}'`);
    expect(sql.match(/array\[([^\]]*)\]/)?.[1].split(",").length).toBe(RULE_SECTIONS.length);
  });
  it("lets only the owner write, through audited functions, and managers read", () => {
    expect(sql.match(/public\.is_privileged\(\)/g)).toHaveLength(2);
    expect(sql).toContain("statutory_rates_set");
    expect(sql).toContain("statutory_rates_deleted");
    expect(sql).toContain("get_my_role() = 'manager'");
    expect(sql).not.toMatch(/for (insert|update|delete)/);
  });
});
