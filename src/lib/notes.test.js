import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { canOpenNavItem, MANAGER_NAV_ITEMS, MANAGER_NAV_V3 } from "./manager-nav";
import { cleanNoteBody, dueCount, msUntilNextReminder, noteState, reminderFields, reminderInstant, snoozeChoices, sortNotes } from "./notes";

const now = new Date("2026-10-22T15:00:00Z");
const note = (id, extra = {}) => ({ id, body: id, created_at: "2026-10-20T12:00:00Z", remind_at: null, done_at: null, ...extra });
const notes = [
  note("plain-old", { created_at: "2026-10-01T12:00:00Z" }),
  note("plain-new", { created_at: "2026-10-21T12:00:00Z" }),
  note("later", { remind_at: "2026-10-25T12:00:00Z" }),
  note("soon", { remind_at: "2026-10-22T16:00:00Z" }),
  note("due-old", { remind_at: "2026-10-21T12:00:00Z" }),
  note("due-now", { remind_at: "2026-10-22T15:00:00Z" }),
  note("done", { remind_at: "2026-10-21T12:00:00Z", done_at: "2026-10-21T13:00:00Z" }),
];

describe("notes and reminders (0111)", () => {
  it("tells due, upcoming, plain and done notes apart; a done note is never due", () => {
    expect(notes.map((n) => noteState(n, now))).toEqual(["plain", "plain", "upcoming", "upcoming", "due", "due", "done"]);
    expect(dueCount(notes, now)).toBe(2);
  });

  it("puts due reminders first, then upcoming, then the newest notes, then done ones", () => {
    expect(sortNotes(notes, now).map((n) => n.id)).toEqual(["due-old", "due-now", "soon", "later", "plain-new", "plain-old", "done"]);
  });

  it("knows when the next reminder comes due, for the side-menu badge", () => {
    expect(msUntilNextReminder(notes, now)).toBe(60 * 60 * 1000);
    expect(msUntilNextReminder([note("x")], now)).toBeNull();
  });

  it("turns a date (and a time, 8:00 by default) into an instant and back", () => {
    const at = reminderInstant("2026-10-24", "");
    expect(reminderFields(at)).toEqual({ date: "2026-10-24", time: "08:00" });
    expect(reminderFields(reminderInstant("2026-10-24", "13:45"))).toEqual({ date: "2026-10-24", time: "13:45" });
    expect(reminderInstant("", "10:00")).toBeNull();
  });

  it("offers later choices after now and refuses an empty or too long note", () => {
    for (const choice of snoozeChoices(now)) expect(new Date(choice.at).getTime()).toBeGreaterThan(now.getTime());
    expect(cleanNoteBody("  ")).toBeNull();
    expect(cleanNoteBody("x".repeat(5001))).toBeNull();
    expect(cleanNoteBody("  appeler Olivier ")).toBe("appeler Olivier");
  });

  it("is in the V3 menu under Aujourd'hui, for managers and the owner only", () => {
    expect(MANAGER_NAV_V3.find((g) => g.id === "today").items.map((i) => i.id)).toContain("notes");
    const item = MANAGER_NAV_ITEMS.find((i) => i.id === "notes");
    expect(canOpenNavItem("owner", [], item)).toBe(true);
    expect(canOpenNavItem("manager", [], item)).toBe(true);
    expect(canOpenNavItem("admin", ["employees", "live"], item)).toBe(false);
    expect(canOpenNavItem("employee", [], item)).toBe(false);
  });

  it("keeps notes private to their author, in a manager-level (two-factor) session", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261022220000_0111_manager_notes.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/using \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)\s+with check \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.manager_notes from anon, public");
    expect(sql).toContain("char_length(btrim(body)) between 1 and 5000");
    expect(sql).toContain("references auth.users(id) on delete cascade");
    const layout = readFileSync(new URL("../components/manager/ManagerLayout.jsx", import.meta.url), "utf8");
    expect(layout).toMatch(/notes: isManagerRole\(role\) \? dueNotes : 0/);
    expect(layout).toContain("window.addEventListener(NOTES_EVENT, loadNotes)");
  });
});
