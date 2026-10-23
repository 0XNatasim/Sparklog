import { supabase } from "@/supabaseClient";
import { refreshSessionOnce, withTimeout } from "@/lib/utils";
import { isIos, isMobileDevice, isStandalone, urlBase64ToUint8Array } from "@/lib/push-support";

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

// Notifications are on by default (V2.4.173): every account subscribes this device as soon as the browser
// allows it. Only a person who turns them off in Profile stays off, per device and per account.
const OPT_OUT_PREFIX = "sparklog.pushOff.";
const SNOOZE_KEY = "sparklog.pushPromptSnooze";
// Fired after this device's notifications were turned on or off (the card and Profile follow it).
export const PUSH_EVENT = "sparklog:push";

function pushChanged() {
  try {
    window.dispatchEvent(new Event(PUSH_EVENT));
  } catch { /* no window (tests) */ }
}
export const PUSH_PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function isPushOptedOut(userId, store = storage()) {
  if (!userId || !store) return false;
  try {
    return store.getItem(OPT_OUT_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function setPushOptOut(userId, off, store = storage()) {
  if (!userId || !store) return;
  try {
    if (off) store.setItem(OPT_OUT_PREFIX + userId, "1");
    else store.removeItem(OPT_OUT_PREFIX + userId);
  } catch { /* storage blocked: the choice lasts until the page closes */ }
}

export function snoozePushPrompt(now = Date.now(), store = storage()) {
  try {
    store?.setItem(SNOOZE_KEY, String(now + PUSH_PROMPT_SNOOZE_MS));
  } catch { /* storage blocked */ }
}

function promptSnoozedUntil(store = storage()) {
  try {
    return Number(store?.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

// Card « Activer les notifications » at the top of the app: shown while this device has no subscription
// for a person who never turned them off. "ask" = one tap opens the browser's question; "install" = iPhone
// in a Safari tab (add to the home screen first). Never for "denied" (blocked in the settings: Profile
// explains it), "on", unsupported / unconfigured browsers, or a computer (V2.4.174: the card speaks of the
// phone, and Edge on Windows hides the browser's question by default — Profile has the switch there).
// « Plus tard » hides it for 3 days.
export function pushPromptMode(status, { userId, now = Date.now(), store = storage(), mobile = isMobileDevice() } = {}) {
  if (!userId || !mobile || isPushOptedOut(userId, store)) return null;
  if (status !== "off" && status !== "needs-install") return null;
  if (promptSnoozedUntil(store) > now) return null;
  return status === "off" ? "ask" : "install";
}

async function registerSubscription(subscription) {
  const json = subscription.toJSON();
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  return error;
}

// At every app start: when the browser already allows notifications, (re)subscribe this device for the
// signed-in account without asking anything. It also moves a shared phone's subscription to the person
// now signed in (the server re-homes the endpoint). Returns the status; never throws.
export async function syncPushSubscription(userId) {
  try {
    const status = await getPushStatus();
    if (!userId || isPushOptedOut(userId)) return status;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return status;
    if (status !== "on" && status !== "off") return status;
    const registration = await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription())
      || (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const error = await registerSubscription(subscription);
    if (error) {
      console.warn("[push] sync not saved:", error.message || error);
      return status;
    }
    return "on";
  } catch (error) {
    console.warn("[push] sync failed:", error);
    return "unsupported";
  }
}

// "on", "denied" (refused: the browser will not ask again) or "dismissed" (question closed, or hidden by the
// browser — Edge's « quiet » requests show only a small bell in the address bar).
export async function enablePush(userId) {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  setPushOptOut(userId, false);
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    || (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  const error = await registerSubscription(subscription);
  if (error) {
    // Don't leave a browser subscription that the server doesn't know about.
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  pushChanged();
  return "on";
}

// Turned off by the person: remembered on this device for this account, so the automatic sync and the
// card leave it off.
export async function disablePush(userId) {
  setPushOptOut(userId, true);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    pushChanged();
    return "off";
  }
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe().catch(() => {});
  pushChanged();
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
