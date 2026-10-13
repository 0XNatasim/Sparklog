import { isNetworkError } from "./error-messages";

// Shared classification of a failed Supabase call, so every caller recovers the same way:
//   "auth"      — expired/invalid session (HTTP 401, PGRST301/302, "JWT expired"):
//                 refresh the session, then retry once more;
//   "transient" — network loss, timeout, HTTP 5xx/408/429, database lock/serialization/
//                 statement timeout: retry later, the request is idempotent;
//   "permanent" — the server refused the request itself (a SQLSTATE / PostgREST code or an
//                 HTTP 4xx: validation, overlap, permission, conflict…): retrying cannot help;
//   "unknown"   — anything else (client-side error, unexpected shape): callers keep their
//                 previous behaviour (withRetry still retries it; no automatic resend).
const TRANSIENT_SQLSTATES = new Set(["40001", "40P01", "55P03", "57014", "57P01", "53300", "08000", "08003", "08006"]);
const AUTH_CODES = new Set(["PGRST301", "PGRST302", "PGRST303"]);

export function classifyApiError(error) {
  if (!error) return "unknown";
  const status = Number(error.status ?? error.statusCode ?? error.context?.status) || 0;
  const code = String(error.code ?? "");
  const message = String(error.message ?? error ?? "");
  if (status === 401 || AUTH_CODES.has(code) || /jwt expired|invalid jwt|jwt.*(malformed|invalid)/i.test(message)) return "auth";
  if (isNetworkError(error)) return "transient";
  if (status >= 500 || status === 408 || status === 429) return "transient";
  if (TRANSIENT_SQLSTATES.has(code)) return "transient";
  if (status === 0 && !code && /^(FetchError|TypeError):/i.test(message)) return "transient";
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST") || (status >= 400 && status < 500)) return "permanent";
  return "unknown";
}

export const isTransientApiError = (error) => classifyApiError(error) === "transient";
