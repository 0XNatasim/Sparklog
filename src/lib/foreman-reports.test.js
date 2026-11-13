import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { MAX_AUDITED_NAME, MAX_REPORT, cleanReport, filterReports, foremanReportsCsv, isForemanOt, isNoteReturned, isNoteUnread, saveJobNote } from "./foreman-reports";

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

  it("attaches a new note to its job, edits the existing one, and treats a repeated key as the same note", async () => {
    const args = { userId: "u", jobId: "j1", submissionKey: "k", reportDate: "2026-11-10", auditedName: "", body: "texte" };
    const insert = vi.fn().mockResolvedValue({ error: null });
    const noNote = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert };
    await saveJobNote({ from: () => noNote }, args);
    expect(insert).toHaveBeenCalledWith({ user_id: "u", job_id: "j1", submission_key: "k", report_date: "2026-11-10", audited_name: null, body: "texte" });

    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    const hasNote = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "r1" }, error: null }) }) }), update };
    await saveJobNote({ from: () => hasNote }, { ...args, auditedName: "Paul", body: "corrigé" });
    expect(update).toHaveBeenCalledWith({ audited_name: "Paul", body: "corrigé" });

    const dup = { ...noNote, insert: async () => ({ error: { code: "23505" } }) };
    await expect(saveJobNote({ from: () => dup }, args)).resolves.toBeUndefined();
    const refused = { ...noNote, insert: async () => ({ error: { code: "42501", message: "no" } }) };
    await expect(saveJobNote({ from: () => refused }, args)).rejects.toMatchObject({ code: "42501" });
    await expect(saveJobNote({ from: () => noNote }, { ...args, body: " " })).rejects.toThrow("foreman_report_invalid");
    await expect(saveJobNote({ from: () => noNote }, { ...args, jobId: null })).rejects.toThrow("foreman_report_invalid");
  });

  it("exports the notes with the work sheet they follow, protected against spreadsheet formulas", () => {
    const labels = { columns: { date: "d", author: "a", ot: "o", workDate: "w", times: "t", status: "s", audited: "u", note: "n" }, status: { submitted: "soumis" } };
    const csv = foremanReportsCsv([
      { created_at: "2026-11-10T20:00:00Z", author: "Éric", report_date: "2026-11-10", audited_name: "Paul", body: "=cmd\nligne 2", job: { ot: "CONTREMAÎTRE", job_date: "2026-11-10", depart: "06:30:00", fin: "15:00:00", status: "submitted" } },
      { created_at: "2026-11-09T20:00:00Z", author: "Luc", report_date: "2026-11-09", audited_name: null, body: "x", job: null },
    ], labels);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("d;a;o;w;t;s;u;n");
    expect(csv).toContain("2026-11-10;Éric;CONTREMAÎTRE;2026-11-10;06:30-15:00;soumis;Paul;\"'=cmd\nligne 2\"");
    expect(lines.at(-1)).toBe("2026-11-09;Luc;;2026-11-09;;;;x");
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
  it("lets a foreman insert and read his own and the managers read all (0136 adds edit and delete)", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/using \(user_id = auth\.uid\(\) or public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toMatch(/p\.role = 'foreman'/);
    expect(sql).toContain("grant select, insert on public.foreman_reports to authenticated");
    expect(sql).toContain("foreman_reports_user_key_uniq unique (user_id, submission_key)");
  });
});

describe("migration 0136", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261113120000_0136_foreman_report_on_job.sql", import.meta.url), "utf8");
  it("links a note to its job (deleted with it), one per job, and gives the author the text only while the job is editable", () => {
    expect(sql).toContain("job_id uuid references public.jobs(id) on delete cascade");
    expect(sql).toContain("create unique index if not exists foreman_reports_job_uniq");
    expect(sql).toMatch(/j\.status in \('saved', 'updated'\)/);
    expect(sql).toContain("grant update (body, audited_name) on public.foreman_reports to authenticated");
    expect(sql).toMatch(/for delete to authenticated\s+using \(public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toContain("new.user_id := old.user_id");
    expect(sql).toContain("new.job_id := old.job_id");
  });
  it("attaches the notes written before to the foreman's CONTREMAÎTRE sheet of the day, merging several notes of one sheet", () => {
    expect(sql).toContain("upper(btrim(j.ot)) = 'CONTREMAÎTRE'");
    expect(sql).toContain("having count(*) = 1");
    expect(sql).toContain("string_agg(btrim(n.body)");
    // The backfill runs before the update guard, which freezes job_id.
    expect(sql.indexOf("do $$")).toBeLessThan(sql.indexOf("create trigger foreman_reports_guard_update"));
  });
});

describe("note read state (0138)", () => {
  const note = { created_at: "2026-11-10T20:00:00Z", updated_at: "2026-11-11T10:00:00Z" };
  it("is unread until the manager opened it, and again after the foreman edited it", () => {
    expect(isNoteUnread(note, undefined)).toBe(true);
    expect(isNoteUnread(note, "2026-11-11T12:00:00Z")).toBe(false);
    expect(isNoteUnread(note, "2026-11-10T21:00:00Z")).toBe(true);
    expect(isNoteUnread(null, undefined)).toBe(false);
  });

  const sql = readFileSync(new URL("../../supabase/migrations/20261114120000_0138_foreman_note_reads.sql", import.meta.url), "utf8");
  it("keeps each manager's readings private and the time on the server", () => {
    expect(sql).toContain("primary key (report_id, manager_id)");
    expect(sql).toMatch(/for select to authenticated\s+using \(manager_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toContain("new.read_at := now()");
    expect(sql).toContain("new.updated_at := now()");
    expect(sql).toContain("grant update (read_at) on public.foreman_report_reads to authenticated");
  });
});

describe("migration 0140", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261115120000_0140_foreman_note_return_reason.sql", import.meta.url), "utf8");
  it("returns the sheet like return_job_for_correction, keeps who and why on the note, and does not turn it unread", () => {
    expect(sql).toContain("public.get_my_role() <> 'manager'");
    expect(sql).toContain("current_job.status <> 'submitted' or not current_job.locked");
    expect(sql).toContain("set status = 'updated', locked = false");
    expect(sql).toContain("return_reason = clean_reason");
    expect(sql).toContain("returned_by_name = actor_name");
    expect(sql).toContain("'job_returned_for_correction'");
    expect(sql).toContain("char_length(btrim(return_reason)) between 1 and 500");
    expect(sql).toContain("if new.body is distinct from old.body or new.audited_name is distinct from old.audited_name then");
    expect(sql).toMatch(/grant execute on function public\.return_foreman_note_sheet\(uuid, timestamptz, text\) to authenticated/);
  });
});

describe("isNoteReturned", () => {
  it("is returned from the return until the sheet is submitted again", () => {
    const note = { returned_at: "2026-11-11T15:00:00Z" };
    expect(isNoteReturned(note, "updated")).toBe(true);
    expect(isNoteReturned(note, "saved")).toBe(true);
    expect(isNoteReturned(note, "submitted")).toBe(false);
    expect(isNoteReturned({}, "updated")).toBe(false);
  });
});

