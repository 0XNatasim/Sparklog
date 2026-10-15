// Batch import of old pay stubs: recognise the employee of each parsed talon and build the same
// payroll_period_ledger row as the one-by-one import (ImportLegacyStubsDialog). Pure, testable.
import dayjs from "dayjs";
import { EMPTY_YTD, snapshotToLedgerColumns } from "@/lib/payroll-ledger-fields";

const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean);
const digits = (s) => String(s || "").replace(/\D+/g, "").replace(/^0+(?=\d)/, "");

// "Simon B." on the profile vs "Simon Bellerive" on the stub: same first name, and every other
// profile word is the stub word or its initial.
function nameFits(profileName, stubName) {
  const p = tokens(profileName);
  const s = tokens(stubName);
  if (!p.length || !s.length) return false;
  if (p.join(" ") === s.join(" ")) return true;
  if (p[0] !== s[0] || p.length < 2) return false;
  const rest = s.slice(1);
  const same = (a, b) => a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b));
  return p.slice(1).every((word) => rest.some((w) => same(word, w)));
}

// Which employee a stub belongs to. The name printed on the stub decides; the employee number is
// only used when no name fits (and is then flagged for review). The CCQ number on the stub is the
// employer's, so it is never used. Returns { userId, how: "name" | "number" | "ambiguous" | "none" }.
export function matchStubEmployee(header, employees = []) {
  const stubName = header?.name || "";
  const exact = employees.filter((e) => norm(e.full_name) && norm(e.full_name) === norm(stubName));
  if (exact.length === 1) return { userId: exact[0].id, how: "name" };
  const fits = employees.filter((e) => nameFits(e.full_name, stubName));
  if (fits.length === 1) return { userId: fits[0].id, how: "name" };
  if (fits.length > 1 || exact.length > 1) return { userId: "", how: "ambiguous" };
  const number = digits(header?.employeeNumber);
  if (number) {
    const byNumber = employees.filter((e) => digits(e.employee_number) === number);
    if (byNumber.length === 1) return { userId: byNumber[0].id, how: "number" };
  }
  return { userId: "", how: "none" };
}

// CCQ week (Sun→Sat) start from the ending Saturday.
export const weekStartFromEnd = (end) => dayjs(end).subtract(6, "day").format("YYYY-MM-DD");

// The ledger row for one imported talon (same shape as the one-by-one import): the "Cumulatif"
// figures plus the full talon so the stub can be reprinted. Upserted on (user_id, period_end).
export function ledgerPayloadFor({ userId, talon, snapshot = null, periodEnd = null }) {
  const end = dayjs(periodEnd || talon?.periodEnd || talon?.header?.periodEnd).format("YYYY-MM-DD");
  const snap = snapshot || { ...EMPTY_YTD, ...(talon?.ytd || {}) };
  return {
    user_id: userId,
    tax_year: dayjs(end).year(),
    period_end: end,
    period_start: weekStartFromEnd(end),
    ...snapshotToLedgerColumns(snap),
    imported_talon: talon
      ? { header: { ...talon.header, periodEnd: end, periodStart: weekStartFromEnd(end) }, transactions: talon.transactions || [], sommaire: talon.sommaire || [] }
      : null,
  };
}

// What still needs attention on one batch row before it can be saved.
export function batchRowIssues(row, rows = []) {
  const issues = [];
  if (row.error) return ["error"];
  if (!row.userId) issues.push("noEmployee");
  if (!row.periodEnd || !dayjs(row.periodEnd).isValid()) issues.push("noPeriod");
  if (!row.talon || !Object.keys(row.talon.ytd || {}).length) issues.push("noCumul");
  if (row.userId && row.periodEnd && rows.some((other) => other !== row && !other.error && other.userId === row.userId && other.periodEnd === row.periodEnd)) {
    issues.push("duplicate");
  }
  return issues;
}
