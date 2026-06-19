import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
