import { supabase } from "@/supabaseClient";
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

// Best-effort: the broadcast is already saved, so a push failure must never surface as one.
export async function notifyBroadcastPush(broadcastId) {
  try {
    await supabase.functions.invoke("send_push", { body: { broadcastId } });
  } catch {
    /* in-app bell still shows it */
  }
}
