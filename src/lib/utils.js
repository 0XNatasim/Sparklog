import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "../supabaseClient";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Races a promise against a timeout. If the promise doesn't resolve/reject
// within `ms`, rejects with a timeout error. Used to guard Supabase queries
// against the JWT-refresh hang (token refreshes every hour; if the refresh
// request stalls on a network hiccup, every queued query hangs with it).
export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Request timed out after ${Math.round(ms / 1000)}s. Please retry.`)),
        ms
      )
    ),
  ]);
}

// Runs a fresh Supabase query and, if it times out or fails, retries a few times
// with a short growing backoff — after the first failure it also refreshes the
// session once (guards the hourly JWT-refresh hang). This rides out a transient
// stall such as a Supabase free-tier cold start without surfacing an error to the
// user. The factory is intentional: Supabase query builders/promises must be
// recreated for each attempt. Only the final failure is thrown.
export async function withRetry(makeQuery, ms, { retries = 2, backoffMs = 400 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(makeQuery(), ms);
      if (result?.error) throw result.error;
      return result;
    } catch (e) {
      lastError = e;
      if (attempt === retries) break;
      if (attempt === 0) {
        try { await supabase.auth.refreshSession(); } catch { /* retry anyway */ }
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
    }
  }
  throw lastError;
}
