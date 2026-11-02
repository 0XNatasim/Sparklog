import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = (p) => new URL(`../../${p}`, import.meta.url);
const checkSql = readFileSync(root("supabase/tests/restore-check.sql"), "utf8");
const procedure = readFileSync(root("docs/ops/restore-procedure.md"), "utf8");
const yearEnd = readFileSync(root("docs/ops/year-end-control.sql"), "utf8");
const migrations = readdirSync(root("supabase/migrations")).filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(root(`supabase/migrations/${f}`), "utf8")).join("\n");

describe("restore procedure and its SQL check", () => {
  it("only reads: no statement that writes, alters or drops", () => {
    for (const sql of [checkSql, yearEnd]) {
      const code = sql.replace(/--.*$/gm, "");
      expect(code).not.toMatch(/\b(insert\s+into|update\s+\w|delete\s+from|drop\s|alter\s|truncate|create\s|grant\s)/i);
    }
  });

  it("every table it expects is created by a migration", () => {
    const listed = [...checkSql.matchAll(/\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThanOrEqual(10);
    for (const table of listed) {
      expect(migrations, table).toMatch(new RegExp(`create table (if not exists )?(public\\.)?${table}\\b`));
    }
  });

  it("every scheduled job and bucket it expects is defined by a migration", () => {
    for (const job of ["ccq-daily-sync", "cleanup-evidence-daily", "ccq-card-renewals"]) {
      expect(migrations, job).toContain(`'${job}'`);
    }
    for (const bucket of ["overtime-evidence", "parking-receipts", "accident-files"]) {
      expect(migrations, bucket).toContain(`'${bucket}'`);
    }
  });

  it("the document points to the check and covers backups, Vault, secrets and photos", () => {
    expect(procedure).toContain("supabase/tests/restore-check.sql");
    for (const word of ["Vault", "Secrets", "Pro", "PITR", "Photos", "trimestre"]) {
      expect(procedure, word).toContain(word);
    }
  });

  it("the year-end control only returns counts (no personal value column)", () => {
    const code = yearEnd.replace(/--.*$/gm, "").replace(/'[^']*'/g, "''");
    expect(code).not.toMatch(/full_name|email|\bnas\b|salary|wage/i);
    expect(code.match(/count\(/g).length).toBeGreaterThanOrEqual(7);
  });
});
