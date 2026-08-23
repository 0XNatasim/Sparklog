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

// Runs a fresh Supabase query, then performs one session refresh and one fresh
// retry if the first request times out or fails. The factory is intentional:
// Supabase query builders/promises must be recreated for the retry.
export async function withRetry(makeQuery, ms) {
  const run = async () => {
    const result = await withTimeout(makeQuery(), ms);
    if (result?.error) throw result.error;
    return result;
  };

  try {
    return await run();
  } catch {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Still issue the single retry. Its error is the useful result to surface
      // to the caller, and the network may have recovered in the meantime.
    }
    return run();
  }
}
