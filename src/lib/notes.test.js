import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { canOpenNavItem, MANAGER_NAV_ITEMS, MANAGER_NAV } from "./manager-nav";
import {
  REPLIES_SHOWN, cleanNoteBody, cleanReplyBody, dueCount, inScope, isMine, msUntilNextReminder, newReplyIds, noteState, otherPeopleIds,
  reminderFields, reminderInstant, repliesByNote, snoozeChoices, sortNotes, unreadNoteCount, visibleReplies,
} from "./notes";

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

  it("is in the menu under Aujourd'hui, for managers and the owner only", () => {
    expect(MANAGER_NAV.find((g) => g.id === "today").items.map((i) => i.id)).toContain("notes");
    const item = MANAGER_NAV_ITEMS.find((i) => i.id === "notes");
    expect(canOpenNavItem("owner", [], item)).toBe(true);
    expect(canOpenNavItem("manager", [], item)).toBe(true);
    expect(canOpenNavItem("admin", ["employees", "live"], item)).toBe(false);
    expect(canOpenNavItem("employee", [], item)).toBe(false);
  });

  it("filters private and shared notes, and knows whose note it is", () => {
    const mine = note("a", { user_id: "me", shared: false });
    const shared = note("b", { user_id: "karine", shared: true, done_by: "yanni", done_at: "2026-10-21T13:00:00Z" });
    expect([mine, shared].filter((n) => inScope(n, "private")).map((n) => n.id)).toEqual(["a"]);
    expect([mine, shared].filter((n) => inScope(n, "shared")).map((n) => n.id)).toEqual(["b"]);
    expect([mine, shared].filter((n) => inScope(n, "all"))).toHaveLength(2);
    expect(isMine(mine, "me")).toBe(true);
    expect(isMine(shared, "me")).toBe(false);
    expect(otherPeopleIds([mine, shared], "me").sort()).toEqual(["karine", "yanni"]);
  });

  it("shows private notes to their author only and shared notes to every manager, in a two-factor session", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261022220000_0111_manager_notes.sql", import.meta.url), "utf8");
    // Read: mine or shared. Insert: as myself. Update: mine or shared, and a shared note stays shared for a
    // non-author. Delete: mine only. All behind get_my_role() = 'manager' (aal2).
    expect(sql).toMatch(/for select to authenticated\s+using \(public\.get_my_role\(\) = 'manager' and \(user_id = auth\.uid\(\) or shared\)\)/);
    expect(sql).toMatch(/for insert to authenticated\s+with check \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toMatch(/for update to authenticated\s+using \(public\.get_my_role\(\) = 'manager' and \(user_id = auth\.uid\(\) or shared\)\)\s+with check \(public\.get_my_role\(\) = 'manager' and \(user_id = auth\.uid\(\) or shared\)\)/);
    expect(sql).toMatch(/for delete to authenticated\s+using \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)/);
    // The author never changes; done_by follows done_at.
    expect(sql).toContain("new.user_id := old.user_id;");
    expect(sql).toMatch(/when old\.done_at is null then auth\.uid\(\)/);
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.manager_notes from anon, public");
    expect(sql).toContain("char_length(btrim(body)) between 1 and 5000");
    expect(sql).toContain("references auth.users(id) on delete cascade");
    const layout = readFileSync(new URL("../components/manager/ManagerLayout.jsx", import.meta.url), "utf8");
    expect(layout).toMatch(/notes: isManagerRole\(role\) \? dueNotes \+ repliedNotes : 0/);
    expect(layout).toContain("window.addEventListener(NOTES_EVENT, loadNotes)");
  });

  it("keeps a conversation in order, marks the newest replies of others as new and counts notes once", () => {
    const r = (id, user, at, noteId = "a") => ({ id, note_id: noteId, user_id: user, created_at: at, body: id });
    const rows = [r("3", "karine", "2026-10-26T15:00:00Z"), r("1", "me", "2026-10-26T13:00:00Z"), r("2", "karine", "2026-10-26T14:00:00Z"), r("x", "me", "2026-10-26T10:00:00Z", "b")];
    const grouped = repliesByNote(rows);
    expect(grouped.get("a").map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect([...newReplyIds(grouped.get("a"), "me", 1)]).toEqual(["3"]);
    expect([...newReplyIds(grouped.get("a"), "me", 5)].sort()).toEqual(["2", "3"]);
    expect(newReplyIds(grouped.get("a"), "me", 0).size).toBe(0);
    expect(unreadNoteCount(new Map([["a", 2], ["b", 0], ["c", 1]]))).toBe(2);
    expect(otherPeopleIds([], "me", rows)).toEqual(["karine"]);
    const many = Array.from({ length: REPLIES_SHOWN + 2 }, (_, i) => r(String(i), "me", `2026-10-26T1${i}:00:00Z`));
    expect(visibleReplies(many, false)).toEqual({ shown: many.slice(2), hidden: 2 });
    expect(visibleReplies(many, true).hidden).toBe(0);
    expect(cleanReplyBody("  ok ")).toBe("ok");
    expect(cleanReplyBody(" ")).toBeNull();
    expect(cleanReplyBody("x".repeat(2001))).toBeNull();
  });

  it("lets managers reply only to a shared note they see, and only delete their own reply (0118)", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261027180000_0118_manager_note_replies.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/for select to authenticated\s+using \(public\.get_my_role\(\) = 'manager'\s+and exists \(select 1 from public\.manager_notes n where n\.id = note_id\)\)/);
    expect(sql).toMatch(/for insert to authenticated\s+with check \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\s+and exists \(select 1 from public\.manager_notes n where n\.id = note_id and n\.shared\)\)/);
    expect(sql).toMatch(/"manager_note_replies: delete own" on public\.manager_note_replies\s+for delete to authenticated\s+using \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)/);
    // No update policy or grant: a reply is never edited. Server time; cascade with the note.
    expect(sql).not.toMatch(/on public\.manager_note_replies\s+for update/);
    expect(sql).toContain("grant select, insert, delete on public.manager_note_replies to authenticated");
    expect(sql).toContain("new.created_at := now();");
    expect(sql).toContain("references public.manager_notes(id) on delete cascade");
    expect(sql).toContain("char_length(btrim(body)) between 1 and 2000");
    // Reads: own rows only; the unread count runs under the caller's RLS.
    expect(sql).toMatch(/"manager_note_reads: own rows" on public\.manager_note_reads\s+for all to authenticated\s+using \(user_id = auth\.uid\(\) and public\.get_my_role\(\) = 'manager'\)/);
    expect(sql).toMatch(/my_note_unread_replies\(\)[\s\S]*security invoker/);
    expect(sql).toContain("revoke all on public.manager_note_replies from anon, public");
    expect(sql).toContain("revoke all on public.manager_note_reads from anon, public");
  });
});
