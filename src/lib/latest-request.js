import { useEffect, useState } from "react";

// Latest-wins guard for filter-driven loads. Each begin() aborts the previous request
// and returns a ticket; a response is applied only while ticket.isCurrent(), so a slow
// answer for an old filter can never overwrite the list, counts or page of a newer one.
export function createLatestRequest() {
  let current = null;
  let generation = 0;
  return {
    begin() {
      current?.controller.abort();
      const controller = new AbortController();
      generation += 1;
      const ticket = {
        generation,
        signal: controller.signal,
        controller,
        isCurrent: () => current === ticket && !controller.signal.aborted,
      };
      current = ticket;
      return ticket;
    },
    // Generation of the latest begin(): a follow-up (e.g. "load more") started under
    // generation g is stale as soon as this differs from g.
    generation: () => generation,
    cancel() {
      current?.controller.abort();
      current = null;
    },
  };
}

// One guard per component (stable across renders), aborted on unmount.
export function useLatestRequest() {
  const [request] = useState(createLatestRequest);
  useEffect(() => () => request.cancel(), [request]);
  return request;
}

// An aborted request: either a thrown DOMException or supabase-js's { error } shape
// ("AbortError: …").
export function isAbortError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  return /^AbortError\b/.test(String(error.message || ""));
}
