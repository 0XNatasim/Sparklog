import { supabase } from "@/supabaseClient";
import { refreshSessionOnce, withTimeout } from "@/lib/utils";
import { isIos, isStandalone, urlBase64ToUint8Array } from "@/lib/push-support";

// Public VAPID key (safe to ship). Push is hidden entirely until it is configured.
export const VAPID_PUBLIC_KEY = import.meta.env?.VITE_VAPID_PUBLIC_KEY || "";

// "unsupported" | "needs-install" (iOS in Safari tab) | "unconfigured" | "denied" | "off" | "on"
export async function getPushStatus() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "needs-install";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    || (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  const json = subscription.toJSON();
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) {
    // Don't leave a browser subscription that the server doesn't know about.
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return "on";
}

export async function disablePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "off";
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe().catch(() => {});
  return "off";
}

// Why send_push refused: "session" (session closed or expired, or no two-factor code — sign in again),
// "not_configured" (no VAPID keys on the server) or "error".
export function pushFailureReason(status, code) {
  if (status === 401 || code === "mfa_required" || /session|token/i.test(String(code || ""))) return "session";
  if (status === 503 || code === "push_not_configured") return "not_configured";
  return "error";
}

async function readPushResult({ data, error }) {
  if (!error) {
    if (data && data.ok === false) return { ok: false, reason: pushFailureReason(0, data.error) };
    return { ok: true, sent: Number(data?.sent) || 0, failed: Number(data?.failed) || 0 };
  }
  const status = Number(error?.context?.status) || 0;
  let code = "";
  try {
    code = (await error.context.json())?.error || "";
  } catch {
    /* no JSON body */
  }
  return { ok: false, reason: pushFailureReason(status, code) };
}

// Sends the phone push of a saved broadcast and says how it went: { ok: true, sent, failed } or
// { ok: false, reason }. The broadcast itself is already saved (the bell shows it either way). A refused
// session is refreshed once and the push tried again. Never throws.
// `reread`: after an edit that asks the readers to read it again (0107), push « Message modifié » to
// the recipients who have not pressed OK.
export async function notifyBroadcastPush(broadcastId, { reread = false } = {}) {
  const call = async () => readPushResult(await withTimeout(
    supabase.functions.invoke("send_push", { body: reread ? { broadcastId, reread: true } : { broadcastId } }),
    20000,
  ));
  try {
    let result = await call();
    if (!result.ok && result.reason === "session") {
      await refreshSessionOnce();
      result = await call();
    }
    if (!result.ok) console.warn("[push] not sent:", result.reason);
    return result;
  } catch (error) {
    console.warn("[push] not sent:", error);
    return { ok: false, reason: "error" };
  }
}

// What to tell the manager after a push: { tone: "ok" | "info" | "warning", key, params } (i18n), or
// null when there is nothing to add.
export function pushOutcome(result) {
  if (!result) return null;
  if (!result.ok) return { tone: "warning", key: `push.outcome.${result.reason || "error"}`, params: {} };
  if (result.sent === 0 && result.failed === 0) return { tone: "info", key: "push.outcome.noPhone", params: {} };
  if (result.failed > 0) return { tone: "warning", key: "push.outcome.partial", params: { sent: result.sent, failed: result.failed } };
  return { tone: "ok", key: "push.outcome.sent", params: { count: result.sent } };
}
