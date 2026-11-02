import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dictionaries } from "./i18n";
import { HEALTH_CHECK_IDS, healthSummary, normalizeHealthChecks } from "./system-health";

const migration = readFileSync(new URL("../../supabase/migrations/20261102120000_0132_system_health_checks.sql", import.meta.url), "utf8");

describe("system health checks", () => {
  it("puts the worst first and drops unknown ids", () => {
    const rows = normalizeHealthChecks([
      { id: "rates_stale", status: "ok", value: 5 },
      { id: "export_stuck", status: "bad", value: 3 },
      { id: "mystery", status: "bad" },
      { id: "cron_stale", status: "warn", value: 1 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["export_stuck", "cron_stale", "rates_stale"]);
  });

  it("returns nothing for a non-manager (empty list) or a bad payload", () => {
    expect(normalizeHealthChecks([])).toEqual([]);
    expect(normalizeHealthChecks(null)).toEqual([]);
    expect(healthSummary([]).ok).toBe(false);
  });

  it("summarises", () => {
    expect(healthSummary(normalizeHealthChecks([{ id: "cron_failed", status: "ok" }])).ok).toBe(true);
    expect(healthSummary(normalizeHealthChecks([{ id: "cron_failed", status: "bad" }, { id: "rates_stale", status: "warn" }]))).toMatchObject({ bad: 1, warn: 1, ok: false });
  });

  it("every check the database can return has a French and an English label", () => {
    for (const id of HEALTH_CHECK_IDS) {
      expect(migration, id).toContain(`'${id}'`);
      for (const lang of ["fr", "en"]) {
        expect(dictionaries[lang][`health.check.${id}`], `${lang} ${id}`).toBeTruthy();
        expect(dictionaries[lang][`health.hint.${id}`], `${lang} hint ${id}`).toBeTruthy();
      }
    }
  });

  it("the RPC is read-only and manager-level only", () => {
    expect(migration).toMatch(/get_my_role\(\) is distinct from 'manager'/);
    expect(migration).not.toMatch(/\b(insert into|update public|delete from)\b/i);
    expect(migration).toMatch(/revoke all on function public\.system_health_checks\(\) from public, anon/);
  });
});
