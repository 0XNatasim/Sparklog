// Authoritative payroll classification engine.
//
// This module is intentionally DEPENDENCY-FREE (no dayjs) so the exact same code runs
// in the browser (as a preview) and in the Supabase Edge Function (as the authority) —
// one implementation, no client/server drift. Bump ENGINE_VERSION on any change that can
// alter a classified value; approval snapshots record the version they were computed with.
export const ENGINE_VERSION = "1.2.0";

export function minutesBetween(depart, fin) {
  if (!depart || !fin) return 0;
  const [startHour, startMinute] = String(depart).slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = String(fin).slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return 0;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes);
}

export function getKilometreBreakdown(job) {
  const legacyClient = Math.max(0, Number(job.km_aller) || 0);
  const returnKm = Math.max(0, Number(job.km_retour) || 0);
  const totalKm = Math.max(0, Number(job.km_total) || legacyClient + returnKm);
  return {
    totalKm,
    returnKm: Math.min(returnKm, totalKm),
    clientKm: Math.max(0, totalKm - returnKm),
  };
}

// Parse a YYYY-MM-DD work date at UTC midnight. Using UTC keeps the day-of-week stable
// regardless of the runtime's timezone (browser vs Deno).
function parseWorkDate(jobDate) {
  if (!jobDate) return null;
  const d = new Date(`${String(jobDate).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Day of week for a work date: 0 = Sunday … 6 = Saturday.
function dayOfWeek(jobDate) {
  const d = parseWorkDate(jobDate);
  return d ? d.getUTCDay() : null;
}

// Payroll week runs to the Saturday that ends it (matches the CCQ weekly grouping in
// ccq-export). Used to scope the 1.5x overtime allowance to the week, not the day.
export function payrollWeekKey(jobDate) {
  const d = parseWorkDate(jobDate);
  if (!d) return String(jobDate || "");
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

// Map an employee profile row to the per-employee overtime options used by the
// calculation. Keeps every caller in sync as policies are added.
export function overtimeOptionsFromProfile(profile) {
  // Subcontractors bill simple up to 8h/day and double beyond (no 1.5x tier), and their
  // return-to-warehouse time is always at the simple rate when the day exceeds 8h. Enforce
  // this regardless of the stored toggles so the subcontractor rule always holds.
  if (profile?.role === "subcontractor_1") {
    return { firstOtHourDouble: true, returnOtNoBenefits: true };
  }
  return {
    firstOtHourDouble: Boolean(profile?.overtime_first_hour_double),
    returnOtNoBenefits: Boolean(profile?.return_overtime_no_benefits),
  };
}

// Return minutes already logged inside a job's Départ→Fin span, clamped so it can
// never exceed the span itself.
function jobReturnMinutes(job) {
  const span = minutesBetween(job.depart, job.fin);
  return Math.min(Math.max(0, Number(job.return_time_minutes) || 0), span);
}

// Options (per-employee policies):
//  - firstOtHourDouble: no 1.5x tier — all overtime is 2x.
//  - returnOtNoBenefits: when a day (Départ→Fin, return included) exceeds 8h, the
//    return-to-warehouse portion is carved out and paid at the base rate with NO social
//    benefits (returnNoBenefitMinutes), and the 8h/overtime split is computed on the
//    remaining work only. A day of 8h or less is unaffected (return stays regular, with
//    benefits) — matching the current behaviour.
// `messierMethod` reproduces how Messier Connexion classified hours historically: the weekly
// first hour of overtime that SparkLog pays at 1.5× (the "hors CCQ" tier) is instead counted
// as REGULAR straight time. Double time (2×) is left exactly as-is. Used only by the parallel
// "Façon Messier" comparison views — never by the authoritative export path.
export function calculatePayrollEntries(jobs, { firstOtHourDouble = false, returnOtNoBenefits = false, messierMethod = false } = {}) {
  const sorted = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}${a.id || ""}`.localeCompare(`${b.job_date}${b.depart || ""}${b.id || ""}`));
  // Pre-pass: total worked span per day (return is inside the span). The return
  // carve-out only applies on days whose total exceeds 8h.
  const daySpanMinutes = new Map();
  for (const job of sorted) {
    daySpanMinutes.set(job.job_date, (daySpanMinutes.get(job.job_date) || 0) + minutesBetween(job.depart, job.fin));
  }

  // Regular hours are capped per DAY (8h); the first hour of overtime is allowed once
  // per WEEK at 1.5x, everything beyond that is 2x. Jobs are processed chronologically
  // so the earliest overtime of the week consumes the 1.5x allowance first. When the
  // employee's policy is "first hour at double time", the 1.5x allowance is 0.
  const dayWorkMinutes = new Map();      // job_date -> WORK minutes so far that day (return carved out)
  const weekOvertimeMinutes = new Map(); // week key -> overtime minutes so far that week
  const weekRegularMinutes = new Map();  // week key -> regular minutes so far that week (Messier cap)
  const entries = new Map();

  for (const job of sorted) {
    const wk = payrollWeekKey(job.job_date);
    const priorDayWork = dayWorkMinutes.get(job.job_date) || 0;
    const priorWeekOvertime = weekOvertimeMinutes.get(wk) || 0;
    const priorWeekRegular = weekRegularMinutes.get(wk) || 0;

    const spanMinutes = minutesBetween(job.depart, job.fin);
    // Carve out the return portion only when the policy is on AND the whole day exceeds
    // 8h. Otherwise the return stays inside the paid work span exactly as before.
    const carve = returnOtNoBenefits && (daySpanMinutes.get(job.job_date) || 0) > 480;
    let returnNoBenefitMinutes = carve ? jobReturnMinutes(job) : 0;
    const workMinutes = spanMinutes - returnNoBenefitMinutes; // benefits-eligible work

    const regularRoom = Math.max(0, 480 - priorDayWork);
    let regularWorkMinutes = Math.min(workMinutes, regularRoom);
    const overtimeWorkMinutes = workMinutes - regularWorkMinutes;
    const overtime50Room = firstOtHourDouble ? 0 : Math.max(0, 60 - priorWeekOvertime);
    let overtime50Minutes = Math.min(overtimeWorkMinutes, overtime50Room);
    let overtime100Minutes = overtimeWorkMinutes - overtime50Minutes;
    // Façon Messier: the "hors CCQ" hours are the paid non-CCQ hours (the return-to-shop time
    // carved out with no CCQ benefits). Historically Messier counted those toward the 40h of
    // CCQ regular first — so convert non-CCQ hours into regular (temps CCQ) up to 40h/week.
    // Overtime (1.5× / double) is not touched. A week already at 40h regular is unchanged.
    if (messierMethod && returnNoBenefitMinutes > 0) {
      const room = Math.max(0, 2400 - priorWeekRegular - regularWorkMinutes);
      const move = Math.min(returnNoBenefitMinutes, room);
      returnNoBenefitMinutes -= move;
      regularWorkMinutes += move;
    }
    // Legacy field: return travel was never paid as separate minutes on top of the span.
    // It is kept at 0; the carve-out above re-categorises minutes that are already in the
    // span, so no minute is added or lost.
    const returnRegularMinutes = 0;
    const kilometres = getKilometreBreakdown(job);

    entries.set(job.id, {
      job,
      regularWorkMinutes,
      overtime50Minutes,
      overtime100Minutes,
      overtimeWorkMinutes,
      returnRegularMinutes,
      returnNoBenefitMinutes,
      regularPaidMinutes: regularWorkMinutes + returnRegularMinutes,
      totalPaidMinutes: spanMinutes + returnRegularMinutes,
      ...kilometres,
    });
    dayWorkMinutes.set(job.job_date, priorDayWork + workMinutes);
    weekOvertimeMinutes.set(wk, priorWeekOvertime + overtimeWorkMinutes);
    weekRegularMinutes.set(wk, priorWeekRegular + regularWorkMinutes);
  }
  return entries;
}

export function calculateDailyTotals(jobs, options) {
  const entries = calculatePayrollEntries(jobs, options);
  const days = new Map();
  for (const entry of entries.values()) {
    const date = entry.job.job_date;
    const day = days.get(date) || {
      jobDate: date,
      regularWorkMinutes: 0,
      overtime50Minutes: 0,
      overtime100Minutes: 0,
      overtimeWorkMinutes: 0,
      returnRegularMinutes: 0,
      returnNoBenefitMinutes: 0,
      totalPaidMinutes: 0,
      clientKm: 0,
      returnKm: 0,
      totalKm: 0,
      jobCount: 0,
    };
    for (const key of ["regularWorkMinutes", "overtime50Minutes", "overtime100Minutes", "overtimeWorkMinutes", "returnRegularMinutes", "returnNoBenefitMinutes", "totalPaidMinutes", "clientKm", "returnKm", "totalKm"]) {
      day[key] += entry[key];
    }
    day.jobCount += 1;
    days.set(date, day);
  }
  return days;
}

export function isMealEligible({ jobDate, dailyWorkMinutes }) {
  const weekday = dayOfWeek(jobDate);
  return weekday !== null && weekday !== 0 && weekday !== 6 && Math.max(0, dailyWorkMinutes - 480) >= 135;
}

export function roundHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

// Indemnité de congés (CCQ): 13% of weekly wages earned — 6% annual vacation,
// 5.5% paid statutory holidays, 1.5% sick leave. The rate is the same for every level;
// the dollar amount differs only because wages differ. Base is the gross salary earned
// in the week. Source: CCQ chèque-vacances page; see docs/rules/compensation-rules.md.
export const CONGES_INDEMNITY_RATES = { vacation: 0.06, statutoryHolidays: 0.055, sick: 0.015 };

// Map a conges_indemnity_rate DB row to the rates shape, falling back to the code
// constant for any missing field. Lets the estimate views read the DB value while
// staying safe if the row is absent. (The authoritative export path does not use
// this — it keeps the versioned constant.)
export function congesRatesFromRow(row) {
  if (!row) return CONGES_INDEMNITY_RATES;
  const num = (v, d) => (v == null || Number.isNaN(Number(v)) ? d : Number(v));
  return {
    vacation: num(row.vacation, CONGES_INDEMNITY_RATES.vacation),
    statutoryHolidays: num(row.statutory_holidays, CONGES_INDEMNITY_RATES.statutoryHolidays),
    sick: num(row.sick, CONGES_INDEMNITY_RATES.sick),
  };
}

export function calculateCongesIndemnity(weeklyWageDollars, rates = CONGES_INDEMNITY_RATES) {
  const wages = Math.max(0, Number(weeklyWageDollars) || 0);
  const r = rates || CONGES_INDEMNITY_RATES;
  const vacation = wages * (r.vacation ?? 0);
  const statutoryHolidays = wages * (r.statutoryHolidays ?? 0);
  const sick = wages * (r.sick ?? 0);
  return { vacation, statutoryHolidays, sick, total: vacation + statutoryHolidays + sick };
}

// Authoritative entry point. Given a set of jobs (normally one employee), returns a
// versioned, self-describing classification: a per-job trace, per-week totals, and
// warnings for inputs that need review. Every worked minute is accounted for exactly
// once (regular + ot50 + ot100). This is the contract the Edge Function returns and the
// approval snapshot records.
export function computeWeek(jobs, options) {
  const list = Array.isArray(jobs) ? jobs.filter(Boolean) : [];
  const entriesMap = calculatePayrollEntries(list, options);
  const perJob = [];
  const warnings = [];
  const weeks = new Map();

  for (const job of list) {
    const e = entriesMap.get(job.id);
    if (!e) continue;
    if (!job.depart || !job.fin) {
      warnings.push({ code: "missing_time", jobId: job.id, jobDate: job.job_date });
    } else if (minutesBetween(job.depart, job.fin) === 0) {
      warnings.push({ code: "zero_duration", jobId: job.id, jobDate: job.job_date });
    }
    const weekEnding = payrollWeekKey(job.job_date);
    perJob.push({
      jobId: job.id,
      jobDate: job.job_date,
      weekEnding,
      workMinutes: e.regularWorkMinutes + e.overtimeWorkMinutes,
      regularWorkMinutes: e.regularWorkMinutes,
      overtime50Minutes: e.overtime50Minutes,
      overtime100Minutes: e.overtime100Minutes,
      returnRegularMinutes: e.returnRegularMinutes,
      returnNoBenefitMinutes: e.returnNoBenefitMinutes,
    });
    const w = weeks.get(weekEnding) || {
      weekEnding, regularMinutes: 0, overtime50Minutes: 0, overtime100Minutes: 0,
      returnRegularMinutes: 0, returnNoBenefitMinutes: 0, workedMinutes: 0,
    };
    w.regularMinutes += e.regularWorkMinutes;
    w.overtime50Minutes += e.overtime50Minutes;
    w.overtime100Minutes += e.overtime100Minutes;
    w.returnRegularMinutes += e.returnRegularMinutes;
    w.returnNoBenefitMinutes += e.returnNoBenefitMinutes;
    w.workedMinutes += e.regularWorkMinutes + e.overtimeWorkMinutes;
    weeks.set(weekEnding, w);
  }

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    jobCount: perJob.length,
    perJob,
    weeks: [...weeks.values()].sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)),
    warnings,
  };
}
