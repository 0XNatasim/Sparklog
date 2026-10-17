// « Paie de la semaine » (Gestion V3): one CCQ week, every CCQ employee, in one page.
// The figures come from computeEmployeeWeekTalon — the same calculation as Talons, DAS and the
// printable summary — and « Comptabiliser » writes exactly what Calcul's button writes
// (closing snapshot, talon number, kept talon) to payroll_period_ledger.
import { YTD_COLUMN_TO_KEY, YTD_CCQ_COLUMN_TO_KEY, formatTalonRef, snapshotFromRow } from "@/payroll/employee-week";
import { buildClosing, payTotals } from "@/lib/payroll-closing";
import { buildCalculTalon } from "@/lib/calcul-talon";
import { isFixedPayWeek, isPayrollEmployee } from "@/lib/fixed-pay";
import { isClosedBeforeSparklog } from "@/lib/payroll-opening";

export const TAX_YEAR = 2026; // same constant as Calcul / Talons / DAS
const LEDGER_COLUMNS = [...YTD_COLUMN_TO_KEY, ...YTD_CCQ_COLUMN_TO_KEY];
const PENDING = new Set(["submitted", "updated"]);

const n = (v) => Number(v) || 0;

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Fixed-pay weeks (keyed by their Saturday) after `anchor` (the last posted week end or the opening's
// as-of date; empty = from the start date) up to `lastEnd`.
export function fixedPayWeeksBetween(taxProfile, anchor, lastEnd) {
  if (!taxProfile?.fixedPayStart) return [];
  let weekKey = weekEndOf(taxProfile.fixedPayStart);
  if (anchor) {
    const afterAnchor = weekEndOf(addDays(anchor, 1));
    if (afterAnchor > weekKey) weekKey = afterAnchor;
  }
  const out = [];
  for (; weekKey <= lastEnd; weekKey = addDays(weekKey, 7)) if (isFixedPayWeek(taxProfile, weekKey)) out.push(weekKey);
  return out;
}

// CCQ week (Sunday → Saturday) of a date, keyed by its Saturday.
export function weekEndOf(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, 6 - day);
}

// The last week that is over: the Saturday before `today` (a Saturday's own week is not over).
export function lastCompletedWeekEnd(today) {
  return addDays(weekEndOf(today), -7);
}

export function weekBounds(end) {
  return { start: addDays(end, -6), end, payDate: addDays(end, 5) };
}

// One row per payroll employee (CCQ trades + fixed weekly pay) with jobs in the week, or a fixed-pay week.
//   jobs: every job of these employees from the start of the tax year to the week's end.
//   ledgerByUser: Map user → ledger rows; seedByUser: Map user → payroll_ytd row.
//   compute(profile, approvedJobs, opening) → computeEmployeeWeekTalon(...) result.
export function planPayrollWeek({ weekEnd, profiles = [], jobs = [], ledgerByUser = new Map(), seedByUser = new Map(), taxProfiles = new Map(), compute }) {
  const { start, end } = weekBounds(weekEnd);
  const byUser = new Map();
  for (const job of jobs) {
    if (!byUser.has(job.user_id)) byUser.set(job.user_id, []);
    byUser.get(job.user_id).push(job);
  }
  const rows = [];
  for (const profile of [...profiles].sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "fr"))) {
    const taxProfile = taxProfiles.get(profile.id);
    if (!isPayrollEmployee(profile, taxProfile)) continue;
    const all = byUser.get(profile.id) || [];
    const weekJobs = all.filter((job) => job.job_date >= start && job.job_date <= end);
    // Fixed weekly pay is due every week from its start date, whatever the jobs.
    const fixed = isFixedPayWeek(taxProfile, end);
    if (!weekJobs.length && !fixed) continue;

    const approved = weekJobs.filter((job) => job.status === "approved");
    const toApprove = weekJobs.filter((job) => PENDING.has(job.status)).length;
    const notSubmitted = weekJobs.filter((job) => job.status === "saved").length;
    const ledger = (ledgerByUser.get(profile.id) || []).slice().sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
    const posted = ledger.find((row) => row.period_end === end) || null;
    const before = ledger.filter((row) => row.period_end < start);
    const lastBefore = before[before.length - 1] || null;
    const seed = seedByUser.get(profile.id) || null;
    const opening = snapshotFromRow(lastBefore || seed);

    // Cumulatives chain week to week: an earlier week with approved work must be posted first,
    // and a later posted week means this one can no longer be inserted behind it.
    const anchor = lastBefore?.period_end || seed?.as_of_date || "";
    const postedEnds = new Set(ledger.map((row) => row.period_end));
    const earlier = new Set(all
      .filter((job) => job.status === "approved" && job.job_date < start && (!anchor || job.job_date > anchor))
      .map((job) => weekEndOf(job.job_date)));
    if (fixed) for (const weekKey of fixedPayWeeksBetween(taxProfile, anchor, addDays(end, -7))) earlier.add(weekKey);
    const earlierUnposted = [...earlier].filter((weekKey) => !postedEnds.has(weekKey)).sort();
    const laterPosted = ledger.some((row) => row.period_end > end);

    let state;
    if (posted) state = "posted";
    // Week 42 and before: paid by Dynacom, closed by its cumulative row — never posted here.
    else if (isClosedBeforeSparklog(end)) state = "closed";
    else if (!fixed && (toApprove || notSubmitted)) state = "pending";
    else if (!fixed && !approved.length) state = "empty";
    else if (earlierUnposted.length) state = "blockedEarlier";
    else if (laterPosted) state = "blockedLater";
    else state = "ready";

    let talon = null;
    let error = "";
    if (approved.length || fixed) {
      try {
        talon = compute(profile, approved, opening);
      } catch (e) {
        error = e?.message || String(e);
        if (state === "ready") state = "error";
      }
    }
    const result = talon?.result;
    rows.push({
      profile,
      state,
      error,
      toApprove,
      notSubmitted,
      earlierUnposted,
      posted,
      opening,
      talon,
      noOpening: !lastBefore && !seed,
      noTaxProfile: !taxProfiles.get(profile.id),
      hours: n(talon?.hours?.totalHours) + n(talon?.hours?.returnNbHours),
      gross: n(result?.gross?.total),
      deductions: n(result?.employee?.totalDeductions) + n(talon?.ccqAmounts?.netWithholdings),
      dasArc: n(result?.das?.arc),
      dasQuebec: n(result?.das?.quebec),
      das: n(result?.das?.total),
      // Deposited: pay − deductions (+ safety allowance) + km, phone, storage — as on the talon.
      net: result ? n(payTotals(result, talon.ccqAmounts, talon.reimb).netPlusReimb) : 0,
    });
  }
  const sum = (key, list) => list.reduce((s, row) => s + n(row[key]), 0);
  const counted = rows.filter((row) => row.talon && (row.state === "posted" || row.state === "ready"));
  return {
    start,
    end,
    rows,
    ready: rows.filter((row) => row.state === "ready"),
    totals: {
      gross: sum("gross", counted),
      deductions: sum("deductions", counted),
      dasArc: sum("dasArc", counted),
      dasQuebec: sum("dasQuebec", counted),
      das: sum("das", counted),
      net: sum("net", counted),
    },
    counts: {
      employees: rows.length,
      posted: rows.filter((row) => row.state === "posted").length,
      ready: rows.filter((row) => row.state === "ready").length,
      pending: rows.filter((row) => row.state === "pending").length,
      blocked: rows.filter((row) => row.state.startsWith("blocked") || row.state === "error").length,
    },
  };
}

// The ledger row « Comptabiliser » writes for one planned employee — the same columns and kept
// talon as Calcul's button. `talonSeq` comes from nextTalonSeq; `keepsRealStub` = a real (imported
// or validated) stub is already kept for this week and must not be replaced.
export function ledgerRowFor({ row, weekEnd, weekNo, talonSeq, keepsRealStub = false }) {
  const { start, end, payDate } = weekBounds(weekEnd);
  const { result, ccqAmounts: ccq, reimb, pay } = row.talon;
  const closing = buildClosing({ opening: row.opening, result, ccq, reimb, pay });
  const importedTalon = keepsRealStub ? undefined : buildCalculTalon({
    opening: row.opening, closing, result, ccq, reimb, pay,
    employee: row.profile,
    week: { periodStart: start, periodEnd: end, weekNo },
    reference: formatTalonRef(talonSeq),
    payDate,
  });
  return {
    user_id: row.profile.id,
    tax_year: TAX_YEAR,
    period_end: end,
    period_start: start,
    talon_seq: talonSeq ?? null,
    ...(importedTalon ? { imported_talon: importedTalon } : {}),
    ...Object.fromEntries(LEDGER_COLUMNS.map(([key, col]) => [col, n(closing[key])])),
  };
}

// Same numbering as Calcul: keep the number already given to this week, else the next one.
export async function nextTalonSeq(supabase, userId, periodEnd) {
  const { data: mine } = await supabase.from("payroll_period_ledger")
    .select("talon_seq").eq("user_id", userId).eq("period_end", periodEnd).maybeSingle();
  if (mine?.talon_seq) return mine.talon_seq;
  const { data: top } = await supabase.from("payroll_period_ledger")
    .select("talon_seq").not("talon_seq", "is", null).order("talon_seq", { ascending: false }).limit(1).maybeSingle();
  return (top?.talon_seq || 0) + 1;
}

// Post planned rows one after another (talon numbers follow the posting order, like Calcul).
// Returns { posted: [userId], failed: [{ userId, message }] }.
export async function postPayrollWeek(supabase, rows, { weekEnd, weekNo }) {
  const posted = [];
  const failed = [];
  for (const row of rows) {
    try {
      const talonSeq = await nextTalonSeq(supabase, row.profile.id, weekEnd);
      const { data: existing } = await supabase.from("payroll_period_ledger")
        .select("imported_talon").eq("user_id", row.profile.id).eq("period_end", weekEnd).maybeSingle();
      const keepsRealStub = Boolean(existing?.imported_talon) && existing.imported_talon.header?.source !== "calcul";
      const record = ledgerRowFor({ row, weekEnd, weekNo, talonSeq, keepsRealStub });
      const { error } = await supabase.from("payroll_period_ledger").upsert(record, { onConflict: "user_id,period_end" });
      if (error) throw error;
      posted.push(row.profile.id);
    } catch (e) {
      failed.push({ userId: row.profile.id, message: e?.message || String(e) });
    }
  }
  return { posted, failed };
}
