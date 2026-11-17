import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/ocr", () => ({ compressImage: vi.fn() }));

import { compressImage } from "@/lib/ocr";
import {
  MONTH_END_MAX_FILES, MONTH_END_MIN_FILES, addPickedMonthEndFiles, fetchMyDueMonthEnd, monthEndZipNames, parseRetentionDays, requestState,
  submitMonthEnd, uploadMonthEndFile,
} from "./month-end-inventory";

const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
const picture = (name = "a.png", type = "image/png", size = 1000) => ({ name, type, size });

describe("limits and retention", () => {
  it("asks for 5 to 10 screenshots", () => {
    expect([MONTH_END_MIN_FILES, MONTH_END_MAX_FILES]).toEqual([5, 10]);
  });

  it("accepts a whole number of days from 7 to 365, nothing else", () => {
    expect(parseRetentionDays("60")).toBe(60);
    expect(parseRetentionDays(" 7 ")).toBe(7);
    expect(parseRetentionDays("365")).toBe(365);
    for (const bad of ["6", "366", "0", "", "abc", "60.5", "-60", "1000", null]) expect(parseRetentionDays(bad), String(bad)).toBeNull();
  });
});

describe("addPickedMonthEndFiles", () => {
  it("keeps pictures only and stops at 10 in all, counting those already sent", () => {
    const picked = Array.from({ length: 8 }, (_, i) => picture(`p${i}.png`));
    const { files, skipped } = addPickedMonthEndFiles([], picked, 5);
    expect(files).toHaveLength(5);
    expect(skipped).toBe(3);
  });

  it("refuses documents, SVG and empty files", () => {
    const { files, skipped } = addPickedMonthEndFiles([], [picture("a.pdf", "application/pdf"), picture("a.svg", "image/svg+xml"), picture("e.png", "image/png", 0), picture("ok.jpg", "image/jpeg")]);
    expect(files.map((file) => file.name)).toEqual(["ok.jpg"]);
    expect(skipped).toBe(3);
  });
});

describe("requestState", () => {
  const base = { submitted_at: null, waived_at: null };
  it("tells received, unblocked, late, due and scheduled apart", () => {
    expect(requestState({ ...base, submitted_at: "2026-11-30T20:00:00Z", due_date: "2026-11-30" }, "2026-12-02")).toBe("received");
    expect(requestState({ ...base, waived_at: "2026-12-01T20:00:00Z", due_date: "2026-11-30" }, "2026-12-02")).toBe("waived");
    expect(requestState({ ...base, due_date: "2026-11-30" }, "2026-12-02")).toBe("late");
    expect(requestState({ ...base, due_date: "2026-11-30" }, "2026-11-30")).toBe("due");
    expect(requestState({ ...base, due_date: "2026-11-30" }, "2026-11-20")).toBe("scheduled");
  });
});

describe("monthEndZipNames", () => {
  it("puts each picture in the day's folder, numbered per person, accents and symbols cleaned", () => {
    const names = monthEndZipNames([
      { date: "2026-11-30", person: "Émilie Tremblay" },
      { date: "2026-11-30", person: "Émilie Tremblay" },
      { date: "2026-11-30", person: "../../etc" },
    ]);
    expect(names).toEqual(["2026-11-30/Emilie-Tremblay_1.jpg", "2026-11-30/Emilie-Tremblay_2.jpg", "2026-11-30/etc_1.jpg"]);
    expect(names.some((name) => name.includes(".."))).toBe(false);
  });
});

describe("what the employee owes", () => {
  it("reads the oldest open request, or null when nothing is due", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [{ request_id: REQUEST, due_date: "2026-11-30", files_count: 2 }], error: null }) };
    expect(await fetchMyDueMonthEnd(client)).toEqual({ requestId: REQUEST, dueDate: "2026-11-30", filesCount: 2 });
    expect(client.rpc).toHaveBeenCalledWith("my_month_end_inventory_due");
    expect(await fetchMyDueMonthEnd({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) })).toBeNull();
  });

  it("throws on a read error (the caller decides: the database is the gate)", async () => {
    await expect(fetchMyDueMonthEnd({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }) })).rejects.toThrow("boom");
  });

  it("records the proof through the RPC and throws its error", async () => {
    const ok = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    await submitMonthEnd(ok, REQUEST);
    expect(ok.rpc).toHaveBeenCalledWith("submit_month_end_inventory", { p_request_id: REQUEST });
    await expect(submitMonthEnd({ rpc: vi.fn().mockResolvedValue({ error: new Error("month_end_inventory_too_few") }) }, REQUEST)).rejects.toThrow("too_few");
  });
});

describe("uploadMonthEndFile", () => {
  beforeEach(() => { compressImage.mockReset(); });

  function client({ rpcResult = { data: "file-id", error: null }, uploadError = null } = {}) {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const upload = vi.fn().mockResolvedValue({ error: uploadError });
    return { remove, upload, rpc: vi.fn().mockResolvedValue(rpcResult), storage: { from: vi.fn(() => ({ upload, remove })) } };
  }

  it("uploads into the employee's own folder, then records the picture", async () => {
    compressImage.mockResolvedValue({ size: 5000 });
    const fake = client();
    const result = await uploadMonthEndFile(fake, { userId: USER, requestId: REQUEST }, picture());
    const [path, , options] = fake.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${USER}/${REQUEST}/[0-9a-f-]{36}\\.jpg$`));
    expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(fake.rpc).toHaveBeenCalledWith("add_month_end_inventory_file", { p_request_id: REQUEST, p_path: path, p_size: 5000 });
    expect(result).toEqual({ id: "file-id", path });
  });

  it("removes the object just sent when its record fails, so nothing is left behind", async () => {
    compressImage.mockResolvedValue({ size: 5000 });
    const fake = client({ rpcResult: { data: null, error: new Error("month_end_inventory_too_many") } });
    await expect(uploadMonthEndFile(fake, { userId: USER, requestId: REQUEST }, picture())).rejects.toThrow("too_many");
    expect(fake.remove).toHaveBeenCalledWith([fake.upload.mock.calls[0][0]]);
  });

  it("refuses a picture the browser cannot read and a bad id, before any upload", async () => {
    compressImage.mockResolvedValue(null);
    const fake = client();
    await expect(uploadMonthEndFile(fake, { userId: USER, requestId: REQUEST }, picture())).rejects.toThrow("unreadable");
    await expect(uploadMonthEndFile(fake, { userId: "x/../y", requestId: REQUEST }, picture())).rejects.toThrow("bad_path");
    expect(fake.upload).not.toHaveBeenCalled();
  });
});

describe("migration 0142", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261117120000_0142_month_end_inventory.sql", import.meta.url), "utf8");

  it("keeps the bucket private and images only, with an employee folder rule", () => {
    expect(sql).toMatch(/'month-end-inventory', 'month-end-inventory', false/);
    expect(sql).toMatch(/array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(auth\.uid\(\)\)::text/);
  });

  it("gives the browser no write grant on the tables: managers read, every write is a function", () => {
    expect(sql).toMatch(/revoke all on public\.month_end_inventory_requests from anon, public, authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*on public\.month_end_inventory/);
    expect(sql).toMatch(/for select to authenticated using \(public\.get_my_role\(\) = 'manager'\)/);
  });

  it("restricts the scheduling functions to managers and bounds their inputs", () => {
    for (const name of ["schedule_month_end_inventory", "remove_month_end_inventory_request", "waive_month_end_inventory_request", "set_month_end_inventory_retention"]) {
      const body = sql.slice(sql.indexOf(`function public.${name}`), sql.indexOf("$$;", sql.indexOf(`function public.${name}`)));
      expect(body, name).toMatch(/get_my_role\(\) is distinct from 'manager'/);
    }
    expect(sql).toMatch(/p_days < 7 or p_days > 365/);
    expect(sql).toMatch(/retention_days integer not null default 60 check \(retention_days between 7 and 365\)/);
  });

  it("limits a request to 10 pictures, asks for 5 to send, and ties the path to the employee and the request", () => {
    expect(sql).toMatch(/>= 10 then\s+raise exception 'month_end_inventory_too_many'/);
    expect(sql).toMatch(/total < 5 then raise exception 'month_end_inventory_too_few'/);
    expect(sql).toMatch(/p_path not like uid::text \|\| '\/' \|\| req\.id::text \|\| '\/%'/);
  });

  it("blocks only the SUBMISSION of a sheet dated on or after the day, never a draft, in a separate trigger", () => {
    expect(sql).toMatch(/create trigger trg_month_end_inventory_gate before insert or update of status on public\.jobs/);
    expect(sql).toMatch(/new\.status is distinct from 'submitted' then return new/);
    expect(sql).toMatch(/r\.due_date <= new\.job_date/);
    expect(sql).toMatch(/message = 'month_end_inventory_required'/);
    expect(sql).toMatch(/sparklog\.owner_submit/);
    expect(sql).not.toMatch(/create or replace function public\.validate_job_submission_contract/);
  });

  it("is audited and purges nothing by itself (the cleanup function does)", () => {
    for (const action of ["month_end_inventory_scheduled", "month_end_inventory_submitted", "month_end_inventory_waived", "month_end_inventory_removed", "month_end_inventory_retention_set"]) {
      expect(sql).toContain(`'${action}'`);
    }
    const cleanup = readFileSync(new URL("../../supabase/functions/cleanup_overtime_evidence/index.ts", import.meta.url), "utf8");
    expect(cleanup).toMatch(/from\("month_end_inventory_files"\)/);
    expect(cleanup).toMatch(/\.from\("month-end-inventory"\)/);
  });
});
