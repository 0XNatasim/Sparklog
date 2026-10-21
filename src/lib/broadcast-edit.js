// Edit / withdraw a sent Communications message (migration 0107). Counts used by the manager log and the
// edit form; the database (edit_broadcast / withdraw_broadcast_unread) applies the change.
import { broadcastAttachments } from "./broadcast-attachments";

// Recipients of one broadcast: still targeted (not withdrawn), of whom read (OK pressed) or not yet,
// and withdrawn from.
export function recipientStatus(recipients) {
  const list = recipients || [];
  const active = list.filter((r) => !r.withdrawn_at);
  const acked = active.filter((r) => r.acknowledged_at).length;
  return { total: active.length, acked, pending: active.length - acked, withdrawn: list.length - active.length };
}

// The edit asks the people who already read it to read it again only when someone has read it.
export function canAskReread(recipients) {
  return recipientStatus(recipients).acked > 0;
}

// Same rule as the database: a message needs text or at least one attachment.
export function editIsEmpty(body, attachments) {
  return !String(body || "").trim() && !(attachments || []).length;
}

// Nothing changed: same text (trimmed) and same attachments in the same order.
export function editIsUnchanged(broadcast, body, attachments) {
  const before = broadcastAttachments(broadcast).map((a) => a.path).join("|");
  const after = (attachments || []).map((a) => a.path).join("|");
  return String(broadcast?.body || "").trim() === String(body || "").trim() && before === after;
}

// Recipient line in the log: read / not read / withdrawn.
export function recipientState(recipient) {
  if (recipient?.withdrawn_at) return "withdrawn";
  return recipient?.acknowledged_at ? "read" : "pending";
}
