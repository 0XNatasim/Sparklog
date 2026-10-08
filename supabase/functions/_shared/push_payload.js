// Pure helpers shared by the send_push Edge Function (Deno) and the Vitest suite (Node),
// so the payload shape and the "subscription is gone" rule are tested without a runtime.

const MAX_BODY_CHARS = 140;

export function truncate(text, max = MAX_BODY_CHARS) {
  const chars = [...String(text ?? "").replace(/\s+/g, " ").trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

// Payload read by public/push-sw.js. `tag` collapses repeats of the same broadcast.
export function buildPushPayload({ title, body, url = "/", tag }) {
  return JSON.stringify({
    title: truncate(title || "SparkLog", 60),
    body: truncate(body),
    url: typeof url === "string" && url.startsWith("/") ? url : "/",
    tag: tag || undefined,
  });
}

// 404/410 from the push service mean the subscription was revoked or expired: delete it.
export function isGonePushStatus(status) {
  return status === 404 || status === 410;
}
