// Two-factor authentication (migration 0103): manager-level Edge Functions only act for a session that
// passed the second factor (JWT claim `aal` = "aal2"), like get_my_role() / is_privileged() in the
// database. Call it AFTER auth.getUser(token) succeeded: that call verifies the token; this only reads it.
export function sessionAal(token) {
  try {
    const part = String(token || "").split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return String(JSON.parse(json)?.aal || "");
  } catch {
    return "";
  }
}

export function isAal2(token) {
  return sessionAal(token) === "aal2";
}
