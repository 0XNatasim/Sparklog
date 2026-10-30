import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { fileKey, listEvidenceFiles, selectEvidence, zipEntryNames } from "./evidence-download";

const names = new Map([["u1", "Alex Test"], ["u2", "Sam Essai"]]);
const files = listEvidenceFiles({
  overtime: [{ storage_path: "u1/a.jpg", job_date: "2026-10-28", user_id: "u1", jobs: { ot: "190403" } }],
  parking: [
    { storage_path: "u2/p1.jpg", extra_storage_paths: ["u2/p2.jpg"], job_date: "2026-10-27", user_id: "u2", jobs: { ot: "PAUSE/SÉCURITÉ" } },
    { storage_path: null, extra_storage_paths: [], job_date: "2026-10-26", user_id: "u2", jobs: null },
  ],
  names,
});

describe("evidence download", () => {
  it("lists every kept picture, oldest first, skipping purged claims", () => {
    expect(files.map((f) => f.path)).toEqual(["u2/p1.jpg", "u2/p2.jpg", "u1/a.jpg"]);
  });

  it("brings only what was not downloaded yet, unless asked for everything", () => {
    const done = new Set([fileKey(files[0])]);
    const first = selectEvidence(files, { done });
    expect(first.chosen.map((f) => f.path)).toEqual(["u2/p2.jpg", "u1/a.jpg"]);
    expect(first.alreadyDone).toBe(1);
    expect(selectEvidence(files, { done, includeDone: true }).chosen).toHaveLength(3);
  });

  it("filters by period and kind", () => {
    expect(selectEvidence(files, { from: "2026-10-28" }).chosen.map((f) => f.path)).toEqual(["u1/a.jpg"]);
    expect(selectEvidence(files, { kinds: ["parking"] }).chosen).toHaveLength(2);
  });

  it("downloading twice the same set gives nothing the second time", () => {
    const done = new Set(selectEvidence(files).chosen.map(fileKey));
    expect(selectEvidence(files, { done }).chosen).toEqual([]);
  });

  it("names the entries by day and person, safe and unique", () => {
    expect(zipEntryNames(files)).toEqual([
      "2026-10-27_Sam Essai_OT PAUSE-SÉCURITÉ_stationnement-1.jpg",
      "2026-10-27_Sam Essai_OT PAUSE-SÉCURITÉ_stationnement-2.jpg",
      "2026-10-28_Alex Test_OT 190403_temps-supp.jpg",
    ]);
    const twice = zipEntryNames([files[2], files[2]]);
    expect(twice[1]).toBe("2026-10-28_Alex Test_OT 190403_temps-supp (2).jpg");
  });
});

describe("migration 0126", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261031120000_0126_parking_retention_and_evidence_downloads.sql", import.meta.url), "utf8");

  it("keeps parking pictures as long as the overtime proofs, but never the claim itself", () => {
    expect(sql).toContain("overtime_settings");
    expect(sql).toContain("alter column storage_path drop not null");
    expect(sql).toContain("pictures_purged_at");
  });

  it("remembers downloads for managers only, written once and never edited by the browser", () => {
    expect(sql).toContain("alter table public.evidence_downloads enable row level security");
    expect(sql).toContain("grant select, insert on public.evidence_downloads to authenticated");
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*evidence_downloads/);
    expect(sql.match(/get_my_role\(\) = 'manager'/g)).toHaveLength(2);
  });
});
