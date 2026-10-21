// Pure helpers shared by the send_push Edge Function (Deno) and the Vitest suite (Node),
// so the payload shape and the "subscription is gone" rule are tested without a runtime.

const MAX_BODY_CHARS = 140;

export function truncate(text, max = MAX_BODY_CHARS) {
  const chars = [...String(text ?? "").replace(/\s+/g, " ").trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

// Payload read by public/push-sw.js. `tag` collapses repeats of the same broadcast.
// `badge` is the recipient's unread count, shown on the app icon (Badging API).
export function buildPushPayload({ title, body, url = "/", tag, badge }) {
  return JSON.stringify({
    title: truncate(title || "SparkLog", 60),
    body: truncate(body),
    url: typeof url === "string" && url.startsWith("/") ? url : "/",
    tag: tag || undefined,
    badge: Number.isInteger(badge) && badge >= 0 ? Math.min(badge, 999) : undefined,
  });
}

// 404/410 from the push service mean the subscription was revoked or expired: delete it.
export function isGonePushStatus(status) {
  return status === 404 || status === 410;
}

// A message edited with « read it again » (migration 0107) is pushed again to the recipients who have
// not pressed OK, with a prefix so the phone shows it is a correction, not a new message.
export const REREAD_PREFIX = "Message modifié : ";
export function pushBodyFor(body, { reread = false } = {}) {
  if (!reread) return body ?? "";
  return `${REREAD_PREFIX}${String(body ?? "").trim() || "pièce jointe"}`;
}

// Only the sender pushes a new message; only the manager who last edited it pushes the correction
// (prevents replaying someone else's broadcast).
export function canPushBroadcast(broadcast, callerId, { reread = false } = {}) {
  if (!broadcast || !callerId) return false;
  return reread ? broadcast.edited_by === callerId : broadcast.sender_id === callerId;
}
