import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { MAX_AUDITED_NAME, MAX_REPORT, cleanReport, filterReports, isForemanOt, submitForemanReport } from "./foreman-reports";

describe("foreman reports", () => {
  it("recognises the CONTREMAÎTRE work order, whatever the case or spaces", () => {
    expect(isForemanOt("CONTREMAÎTRE")).toBe(true);
    expect(isForemanOt("  contremaître ")).toBe(true);
    expect(isForemanOt("PAUSE SÉCURITÉ")).toBe(false);
    expect(isForemanOt("")).toBe(false);
    expect(isForemanOt("123456")).toBe(false);
  });

  it("accepts a text with an optional name and refuses an empty or too long one", () => {
    expect(cleanReport({ auditedName: "  Paul   Roy ", body: " ok \r\n bien " })).toEqual({ auditedName: "Paul Roy", body: "ok \n bien" });
    expect(cleanReport({ auditedName: "", body: "x" })).toEqual({ auditedName: null, body: "x" });
    expect(cleanReport({ auditedName: "", body: "   " })).toBeNull();
    expect(cleanReport({ auditedName: "", body: "x".repeat(MAX_REPORT + 1) })).toBeNull();
    expect(cleanReport({ auditedName: "n".repeat(MAX_AUDITED_NAME + 1), body: "x" })).toBeNull();
  });

  it("sends one report, treats a repeated submission key as the same report, and rethrows other errors", async () => {
    const args = { userId: "u", submissionKey: "k", reportDate: "2026-11-10", auditedName: "", body: "texte" };
    const insert = vi.fn().mockResolvedValue({ error: null });
    await submitForemanReport({ from: () => ({ insert }) }, args);
    expect(insert).toHaveBeenCalledWith({ user_id: "u", submission_key: "k", report_date: "2026-11-10", audited_name: null, body: "texte" });
    await expect(submitForemanReport({ from: () => ({ insert: async () => ({ error: { code: "23505" } }) }) }, args)).resolves.toBeUndefined();
    await expect(submitForemanReport({ from: () => ({ insert: async () => ({ error: { code: "42501", message: "no" } }) }) }, args)).rejects.toMatchObject({ code: "42501" });
    await expect(submitForemanReport({ from: () => ({ insert }) }, { ...args, body: " " })).rejects.toThrow("foreman_report_invalid");
  });

  it("searches author, audited person and text without caring for accents or case", () => {
    const list = [
      { author: "Éric Tremblay", audited_name: "Paul", body: "Casque oublié" },
      { author: "Luc", audited_name: null, body: "Rien à signaler" },
    ];
    expect(filterReports(list, "eric")).toHaveLength(1);
    expect(filterReports(list, "CASQUE")).toHaveLength(1);
    expect(filterReports(list, "")).toHaveLength(2);
  });
});

describe("migration 0134", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261110180000_0134_foreman_reports.sql", import.meta.url), "utf8");
  it("lets a foreman insert and read his own, the managers read all, and nobody edits or deletes", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/using \(user_id = auth\.uid\(\) or public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toMatch(/p\.role = 'foreman'/);
    expect(sql).toContain("grant select, insert on public.foreman_reports to authenticated");
    expect(sql).not.toMatch(/for (update|delete)/);
    expect(sql).toContain("foreman_reports_user_key_uniq unique (user_id, submission_key)");
  });
});
