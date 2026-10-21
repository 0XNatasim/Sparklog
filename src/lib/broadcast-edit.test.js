import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAskReread, editIsEmpty, editIsUnchanged, recipientState, recipientStatus } from "./broadcast-edit";
import { canPushBroadcast, pushBodyFor, REREAD_PREFIX } from "../../supabase/functions/send_push/push_payload.js";

const recips = [
  { employee_id: "a", acknowledged_at: "2026-10-21T12:00:00Z", withdrawn_at: null },
  { employee_id: "b", acknowledged_at: null, withdrawn_at: null },
  { employee_id: "c", acknowledged_at: null, withdrawn_at: "2026-10-21T13:00:00Z" },
  { employee_id: "d", acknowledged_at: null, withdrawn_at: null },
];

describe("recipients of a sent message (0107)", () => {
  it("counts read, not read and withdrawn; withdrawn people leave the total", () => {
    expect(recipientStatus(recips)).toEqual({ total: 3, acked: 1, pending: 2, withdrawn: 1 });
    expect(recipientStatus([])).toEqual({ total: 0, acked: 0, pending: 0, withdrawn: 0 });
  });

  it("offers « read it again » only when someone already read it", () => {
    expect(canAskReread(recips)).toBe(true);
    expect(canAskReread(recips.filter((r) => !r.acknowledged_at))).toBe(false);
  });

  it("gives each recipient one state", () => {
    expect(recips.map(recipientState)).toEqual(["read", "pending", "withdrawn", "pending"]);
  });
});

describe("edit form checks", () => {
  const broadcast = { body: "Réunion jeudi", attachments: [], image_path: "11111111-1111-1111-1111-111111111111.jpg" };

  it("refuses a message with neither text nor attachment", () => {
    expect(editIsEmpty("   ", [])).toBe(true);
    expect(editIsEmpty("", [{ path: "x.pdf" }])).toBe(false);
  });

  it("detects an unchanged message, old single-picture messages included", () => {
    const legacy = [{ path: broadcast.image_path, kind: "image", name: "" }];
    expect(editIsUnchanged(broadcast, " Réunion jeudi ", legacy)).toBe(true);
    expect(editIsUnchanged(broadcast, "Réunion vendredi", legacy)).toBe(false);
    expect(editIsUnchanged(broadcast, "Réunion jeudi", [])).toBe(false);
  });
});

describe("push after an edit (send_push)", () => {
  it("prefixes the correction and leaves a new message unchanged", () => {
    expect(pushBodyFor("Réunion vendredi", { reread: true })).toBe(`${REREAD_PREFIX}Réunion vendredi`);
    expect(pushBodyFor("Réunion vendredi")).toBe("Réunion vendredi");
    expect(pushBodyFor("", { reread: true })).toBe(`${REREAD_PREFIX}pièce jointe`);
  });

  it("lets only the sender push a new message and only the last editor push the correction", () => {
    const b = { sender_id: "boss", edited_by: "manager" };
    expect(canPushBroadcast(b, "boss")).toBe(true);
    expect(canPushBroadcast(b, "manager")).toBe(false);
    expect(canPushBroadcast(b, "manager", { reread: true })).toBe(true);
    expect(canPushBroadcast(b, "boss", { reread: true })).toBe(false);
    expect(canPushBroadcast({ sender_id: "boss", edited_by: null }, null, { reread: true })).toBe(false);
  });
});

describe("migration 0107 and send_push", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261021200000_0107_broadcast_edit_withdraw.sql", import.meta.url), "utf8");
  const push = readFileSync(new URL("../../supabase/functions/send_push/index.ts", import.meta.url), "utf8");

  it("hides withdrawn messages from the employee in every policy", () => {
    expect(sql).toMatch(/"broadcasts: recipient read"[\s\S]*?r\.withdrawn_at is null/);
    expect(sql).toMatch(/"broadcast recipients: employee read own"[\s\S]*?using \(employee_id = auth\.uid\(\) and withdrawn_at is null\)/);
    expect(sql).toMatch(/"broadcast recipients: employee ack own"[\s\S]*?with check \(employee_id = auth\.uid\(\) and withdrawn_at is null\)/);
  });

  it("checks the manager role (aal2 via get_my_role) in both functions and logs to the Journal", () => {
    expect(sql.match(/public\.get_my_role\(\) is distinct from 'manager'/g)).toHaveLength(2);
    expect(sql).toContain("'broadcast_edited'");
    expect(sql).toContain("'broadcast_withdrawn'");
    expect(sql).toMatch(/revoke all on public\.broadcast_revisions from anon;\nrevoke insert, update, delete on public\.broadcast_revisions from authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.edit_broadcast\(uuid, text, jsonb, boolean\) from public, anon/);
  });

  it("never pushes to withdrawn recipients and pushes a correction only to those who have not pressed OK", () => {
    expect(push).toMatch(/\.is\("withdrawn_at", null\);\n\s*if \(reread\) recipientQuery = recipientQuery\.is\("acknowledged_at", null\)/);
    expect(push).toContain("canPushBroadcast(broadcast, callerUser.user.id, { reread })");
  });
});
