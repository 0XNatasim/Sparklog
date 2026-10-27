// @vitest-environment jsdom
// Shared notes hold a conversation (0118): my replies on the right in the action colour, the others' on
// the left in blue with their name; replies written since I last saw the note are marked « Nouveau », the
// note comes first, and the note is then marked as seen. A private note has no conversation.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [async () => true, null] }));

const { default: NotesPanel } = await import("./NotesPanel");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const note = (id, extra) => ({ id, user_id: "me", body: id, shared: false, remind_at: null, done_at: null, done_by: null, created_at: "2026-10-20T12:00:00Z", updated_at: "2026-10-20T12:00:00Z", ...extra });
const reply = (id, user, body, at) => ({ id, note_id: "chat", user_id: user, body, created_at: at });

function setup() {
  const replies = [
    reply("r1", "me", "Tu peux vérifier le NAS ?", "2026-10-26T13:00:00Z"),
    reply("r2", "karine", "Oui, je regarde demain", "2026-10-26T14:00:00Z"),
    reply("r3", "karine", "C'est corrigé", "2026-10-26T15:00:00Z"),
  ];
  state.fake = createFakeSupabase({
    tables: {
      manager_notes: [
        note("older", { body: "Note partagée sans nouveauté", shared: true, created_at: "2026-10-26T12:00:00Z" }),
        note("chat", { body: "Note avec conversation", shared: true, user_id: "karine" }),
        note("mine", { body: "Note privée" }),
      ],
      manager_note_replies: (call) => (call.op === "select" ? replies : call.op === "insert" ? { ...call.payload, id: "r4", user_id: "me", created_at: "2026-10-27T10:00:00Z" } : null),
      manager_note_reads: () => null,
      profiles: [{ id: "karine", full_name: "Karine" }],
    },
    rpcs: { my_note_unread_replies: [{ note_id: "chat", unread: 1 }] },
  });
  return render(<NotesPanel />);
}

afterEach(cleanup);

const card = (text) => screen.getByText(text).closest("[class*='flex-col']");

describe("conversation under a shared note", () => {
  it("shows my replies on the right and the others' on the left with their name, the new one marked", async () => {
    setup();
    await screen.findByText("C'est corrigé");
    const chat = within(card("Note avec conversation"));
    const mine = chat.getByText("Tu peux vérifier le NAS ?").closest("li");
    const theirs = chat.getByText("C'est corrigé").closest("li");
    expect(mine.className).toContain("justify-end");
    expect(mine.firstElementChild.className).toContain("bg-primary");
    expect(theirs.className).toContain("justify-start");
    expect(theirs.firstElementChild.className).toContain("bg-info/15");
    await waitFor(() => expect(within(theirs).getByText("Karine")).toBeTruthy());
    // Only the last reply was written since I last saw the note.
    expect(within(theirs).getByText(fr("notes.replies.new"))).toBeTruthy();
    expect(within(chat.getByText("Oui, je regarde demain").closest("li")).queryByText(fr("notes.replies.new"))).toBeNull();
    expect(chat.getByText(fr("notes.replies.newCount", { count: 1 }))).toBeTruthy();
  });

  it("puts the note with a new reply first and marks it as seen", async () => {
    setup();
    await screen.findByText("C'est corrigé");
    const bodies = screen.getAllByText(/^Note /).map((el) => el.textContent);
    expect(bodies[0]).toBe("Note avec conversation");
    await waitFor(() => expect(state.fake.writes("manager_note_reads")).toHaveLength(1));
    expect(state.fake.writes("manager_note_reads")[0].payload).toEqual([{ note_id: "chat", user_id: "me" }]);
  });

  it("sends a reply and shows it on my side; a private note has no conversation", async () => {
    setup();
    await screen.findByText("C'est corrigé");
    const chat = within(card("Note avec conversation"));
    fireEvent.change(chat.getByLabelText(fr("notes.replies.placeholder")), { target: { value: "  Merci !  " } });
    fireEvent.click(chat.getByRole("button", { name: fr("notes.replies.send") }));
    await waitFor(() => expect(chat.getByText("Merci !")).toBeTruthy());
    const insert = state.fake.writes("manager_note_replies").find((c) => c.op === "insert");
    expect(insert.payload).toEqual({ note_id: "chat", body: "Merci !" });
    expect(chat.getByText("Merci !").closest("li").className).toContain("justify-end");
    expect(within(card("Note privée")).queryByLabelText(fr("notes.replies.placeholder"))).toBeNull();
  });

  it("removes my reply", async () => {
    setup();
    await screen.findByText("C'est corrigé");
    const chat = within(card("Note avec conversation"));
    fireEvent.click(chat.getByRole("button", { name: fr("notes.replies.delete") }));
    await waitFor(() => expect(chat.queryByText("Tu peux vérifier le NAS ?")).toBeNull());
    expect(state.fake.writes("manager_note_replies").find((c) => c.op === "delete").filters).toContainEqual(["eq", "id", "r1"]);
  });
});
