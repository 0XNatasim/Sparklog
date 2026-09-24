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

// Single-flight, throttled session refresh. A page runs many queries at once
// (dashboards fire several in parallel); when the DB or auth server is briefly
// slow they ALL time out at roughly the same moment. If each one then called
// supabase.auth.refreshSession() we'd fire a burst of concurrent refresh-token
// requests — and because Supabase rotates the refresh token, the losers of that
// race get "Invalid Refresh Token: Refresh Token Not Found" and the client signs
// the user OUT. That is the "logged out at random / repeatedly" symptom. Collapse
// any burst into ONE refresh, and don't refresh again for a short cooldown.
let refreshInFlight = null;
let lastRefreshAt = 0;
const REFRESH_COOLDOWN_MS = 20_000;

export function refreshSessionOnce() {
  if (refreshInFlight) return refreshInFlight;
  if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) return Promise.resolve();
  refreshInFlight = (async () => {
    try {
      // refreshSession() acquires the auth lock with NO timeout internally; if a
      // stalled request is holding that lock it would otherwise wait forever and
      // freeze the whole save. Bound it so withRetry always proceeds to its next
      // (also timeout-bounded) attempt.
      await withTimeout(supabase.auth.refreshSession(), 8000);
    } catch {
      /* retry the query anyway; a failed/stalled refresh must not itself throw here */
    } finally {
      lastRefreshAt = Date.now();
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// Runs a fresh Supabase query and, if it times out or fails, retries a few times
// with a short growing backoff — after the first failure it also refreshes the
// session once (guards the hourly JWT-refresh hang), sharing a single throttled
// refresh across all concurrent callers so a burst of timeouts can't stampede the
// auth server and rotate the user out. This rides out a transient stall such as a
// Supabase free-tier cold start without surfacing an error to the user. The factory
// is intentional: Supabase query builders/promises must be recreated for each
// attempt. Only the final failure is thrown.
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
        await refreshSessionOnce();
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
    }
  }
  throw lastError;
}
