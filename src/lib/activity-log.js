import { supabase } from "../supabaseClient";

// Short, human device label stored with sign-in / app-open events
// (e.g. "iPhone · app", "Windows"). Never the full user-agent string.
export function describeDevice(userAgent = "", standalone = false) {
  const ua = String(userAgent);
  let device = "Autre";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) device = "iPad";
  else if (/Android/i.test(ua)) device = /Mobile/i.test(ua) ? "Android" : "Tablette Android";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";
  else if (/CrOS/i.test(ua)) device = "Chromebook";
  else if (/Linux/i.test(ua)) device = "Linux";
  return standalone ? `${device} · app` : device;
}

function currentDevice() {
  if (typeof navigator === "undefined") return null;
  const standalone = typeof window !== "undefined"
    && (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true);
  return describeDevice(navigator.userAgent, Boolean(standalone));
}

// Record a sign-in ("login") or an app visit ("app_open") in the employee activity
// log. Best effort: the server de-duplicates and failures are ignored, so this can
// never block signing in or using the app.
export async function logActivity(event) {
  try {
    await supabase.rpc("log_employee_activity", { p_event: event, p_device: currentDevice() });
  } catch {
    /* informational only */
  }
}
