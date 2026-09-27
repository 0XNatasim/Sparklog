import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPANY_TIME_ZONE,
  companyDate,
  resolveCompanyWallTime,
  resolveJobInstants,
} from "./company-time";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/0063_montreal_timezone_and_dst.sql",
  import.meta.url
)), "utf8");

describe("Montréal company time", () => {
  it("uses the DST-aware IANA timezone", () => {
    expect(COMPANY_TIME_ZONE).toBe("America/Toronto");
    expect(companyDate(new Date("2026-01-01T03:00:00Z"))).toBe("2025-12-31");
  });

  it("applies winter and summer offsets", () => {
    expect(resolveCompanyWallTime("2026-01-15", "08:00").instant.toISOString()).toBe("2026-01-15T13:00:00.000Z");
    expect(resolveCompanyWallTime("2026-07-15", "08:00").instant.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("rejects the spring gap and repeated fall hour", () => {
    expect(resolveCompanyWallTime("2026-03-08", "02:30").status).toBe("nonexistent");
    expect(resolveCompanyWallTime("2026-11-01", "01:30").status).toBe("ambiguous");
  });

  it("calculates actual elapsed time across a DST transition", () => {
    const result = resolveJobInstants("2026-11-01", "00:30", "02:30");
    expect(result.status).toBe("valid");
    expect((result.end - result.start) / 60000).toBe(180);
  });

  it("locks the database contract to Montréal DST and instant overlap checks", () => {
    expect(migrationSql).toContain(`tz text := '${COMPANY_TIME_ZONE}'`);
    expect(migrationSql).toContain("nonexistent_montreal_local_time");
    expect(migrationSql).toContain("ambiguous_montreal_local_time");
    expect(migrationSql).toContain("tstzrange(new.started_at, new.ended_at, '[)')");
    expect(migrationSql).toContain("pg_advisory_xact_lock");
    expect(migrationSql).toContain("update public.jobs");
    expect(migrationSql).toContain("where user_id = new.user_id");
  });
});
