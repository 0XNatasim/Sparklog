import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isScheduledPending, parseScheduledAt } from "./broadcast-schedule";

const NOW = new Date("2026-11-26T15:00:00Z"); // 10:00 in Montréal (UTC-5)

describe("parseScheduledAt (Montréal time)", () => {
  it("turns a Montréal date and time into the instant to send at", () => {
    expect(parseScheduledAt("2026-11-27", "08:00", NOW)).toEqual({ ok: true, iso: "2026-11-27T13:00:00.000Z" });
    expect(parseScheduledAt("2026-07-15", "08:00", new Date("2026-07-01T12:00:00Z"))).toMatchObject({ ok: true, iso: "2026-07-15T12:00:00.000Z" }); // summer: UTC-4
  });
  it("refuses a missing value, a past time, less than a minute away and more than 90 days", () => {
    expect(parseScheduledAt("", "", NOW)).toEqual({ ok: false, error: "invalid" });
    expect(parseScheduledAt("2026-11-26", "09:00", NOW)).toEqual({ ok: false, error: "past" });
    expect(parseScheduledAt("2026-11-26", "10:00", NOW)).toEqual({ ok: false, error: "past" });
    expect(parseScheduledAt("2026-11-26", "10:02", NOW).ok).toBe(true);
    expect(parseScheduledAt("2027-03-01", "08:00", NOW)).toEqual({ ok: false, error: "tooFar" });
  });
  it("refuses a time that does not exist or happens twice at the clock changes", () => {
    const early = new Date("2027-03-01T12:00:00Z");
    expect(parseScheduledAt("2027-03-14", "02:30", early)).toEqual({ ok: false, error: "nonexistent" });
    const autumn = new Date("2026-10-20T12:00:00Z");
    expect(parseScheduledAt("2026-11-01", "01:30", autumn)).toEqual({ ok: false, error: "ambiguous" });
  });
});

describe("isScheduledPending", () => {
  it("is true only while the sending time is in the future", () => {
    expect(isScheduledPending({ scheduled_for: "2026-11-27T13:00:00Z" }, NOW)).toBe(true);
    expect(isScheduledPending({ scheduled_for: "2026-11-26T14:00:00Z" }, NOW)).toBe(false);
    expect(isScheduledPending({ scheduled_for: null }, NOW)).toBe(false);
    expect(isScheduledPending({}, NOW)).toBe(false);
  });
});

describe("migration 0163 and the send_push function", () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
  const sql = read("supabase/migrations/20261126140000_0163_scheduled_broadcasts.sql");
  const fn = read("supabase/functions/send_push/index.ts");
  it("hides a scheduled message from its recipients until its time, claims each due message once for the service role only", () => {
    expect(sql).toMatch(/scheduled_for is null or scheduled_for <= now\(\)/);
    expect(sql).toMatch(/r\.withdrawn_at is null/); // the withdrawal rule of 0107 is kept
    expect(sql).toMatch(/for update skip locked/);
    expect(sql).toMatch(/scheduled_push_at is null/);
    expect(sql).toMatch(/revoke all on function public\.claim_due_broadcasts\(\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_due_broadcasts\(\) to service_role/);
    expect(sql).toMatch(/cron\.schedule\('scheduled-broadcasts', '\* \* \* \* \*'/);
    expect(sql).toMatch(/invalid_schedule/);
  });
  it("send_push: the scheduled task path checks the cron secret before anything else, and a message not yet due is never pushed", () => {
    expect(fn).toMatch(/x-cron-secret/);
    expect(fn.indexOf("verify_cron_secret")).toBeLessThan(fn.indexOf("getUser()"));
    expect(fn).toMatch(/claim_due_broadcasts/);
    expect(fn).toMatch(/scheduled_not_due/);
    expect(fn).toMatch(/scheduled_for > now|new Date\(broadcast\.scheduled_for\)\.getTime\(\) > Date\.now\(\)/);
  });
});
