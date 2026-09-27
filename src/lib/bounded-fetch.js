// Must stay above the longest operation-level timeout. Payroll export allows 60 s;
// this last-resort bound leaves enough time for that caller to receive its response.
export const DEFAULT_REQUEST_TIMEOUT_MS = 75_000;

// Supabase uses one fetch implementation for database, auth, storage and functions.
// Bounding it here is the last-resort safety net for every network request, including
// new call sites that forget to add a shorter, operation-specific timeout.
export function createBoundedFetch({
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function boundedFetch(input, init = {}) {
    const controller = new AbortController();
    const callerSignal = init.signal || input?.signal;
    const abortFromCaller = () => controller.abort(callerSignal.reason);

    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
        "TimeoutError"
      ));
    }, timeoutMs);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  };
}
