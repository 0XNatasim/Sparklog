// Authoritative payroll classification engine — single source for browser and Edge.
//
// This module is intentionally DEPENDENCY-FREE (no dayjs) so the exact same code runs
// in the browser (as a preview) and in the Supabase Edge Function (as the authority) —
// one implementation, no client/server drift. Bump ENGINE_VERSION on any change that can
// alter a classified value; approval snapshots record the version they were computed with.
export const ENGINE_VERSION = "2.4.0";

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
  // return-to-warehouse time is always at the simple rate. Enforce this regardless of the
  // stored toggles so the subcontractor rule always holds.
  if (profile?.role === "subcontractor_1") {
    return { firstOtHourDouble: true, returnWithBenefitsTo8h: false, firstTripUnpaid: Boolean(profile?.first_trip_unpaid) };
  }
  return {
    firstOtHourDouble: Boolean(profile?.overtime_first_hour_double),
    returnWithBenefitsTo8h: Boolean(profile?.return_with_benefits_to_8h),
    firstTripUnpaid: Boolean(profile?.first_trip_unpaid),
  };
}

// Unpaid first trip: for employees flagged `firstTripUnpaid`, the time between Départ and
// Arrivée of the FIRST job of each day (chronologically) is travel to the first client and
// is not paid. Returns a Map job.id -> unpaid minutes (clamped to the Départ→Fin span).
function firstTripUnpaidMinutes(sortedJobs) {
  const unpaid = new Map();
  const seenDays = new Set();
  for (const job of sortedJobs) {
    if (seenDays.has(job.job_date)) continue;
    seenDays.add(job.job_date);
    if (!job.arrivee) continue;
    unpaid.set(job.id, Math.min(minutesBetween(job.depart, job.arrivee), minutesBetween(job.depart, job.fin)));
  }
  return unpaid;
}

// Unpaid first-trip minutes of ONE day's jobs (0 when the first job has no Arrivée). Same
// ordering (earliest Départ, then id) and Départ→Fin clamp as the payroll above. Used by the
// "more than 8 h needs the overtime screenshot" rule so it counts PAID time for employees
// who have the option (a day of 8 h 29 with a 30-minute unpaid trip pays 7 h 59: no overtime).
// Keep the SQL twin in validate_job_submission_contract (migration 0076) in step.
export function dayFirstTripUnpaidMinutes(dayJobs) {
  const jobs = (dayJobs || []).map((job, index) => ({
    ...job,
    id: job.id ?? `#${index}`,
    depart: job.depart ? String(job.depart).slice(0, 5) : job.depart,
    job_date: "day",
  }));
  jobs.sort((a, b) => `${a.depart || ""}${a.id}`.localeCompare(`${b.depart || ""}${b.id}`));
  return [...firstTripUnpaidMinutes(jobs).values()][0] || 0;
}

// Return minutes already logged inside a job's paid span, clamped so it can never
// exceed that span.
function jobReturnMinutes(job, span = minutesBetween(job.depart, job.fin)) {
  return Math.min(Math.max(0, Number(job.return_time_minutes) || 0), span);
}

// Options (per-employee policies):
//  - firstTripUnpaid: Départ→Arrivée of the first job of each day is not paid (removed from
//    the paid span before the 8h/overtime split).
//  - firstOtHourDouble: no 1.5x tier — all overtime is 2x.
//  Return-to-warehouse time (return_time_minutes, logged inside the Départ→Fin span) is
//  never overtime and never counts toward the 8h/overtime split, which is computed on the
//  work only (Messier rule, owner decision 2026-10-13; convention ICI 23.04 2) a), 23.15):
//  - default: all return time is paid at the base rate with NO social benefits
//    (returnNoBenefitMinutes).
//  - returnWithBenefitsTo8h: return time is paid as regular time WITH benefits while the
//    day's work + return stays within 8h; only the part beyond 8h is paid without benefits.
//  Day of the week (convention ICI 21.01, 21.02 b); owner decision 2026-10-13):
//  - Saturday: every worked minute is overtime (no regular hours); the week's first
//    overtime hour still goes at 1.5× if it is unused, the rest at 2×.
//  - Sunday and statutory holidays (`holidayDates`, YYYY-MM-DD from company_holidays):
//    every worked minute at 2× from the first hour; it does not use the 1.5× hour.
//  On those days return time keeps no benefits (there are no regular hours to fill).
// `messierMethod` reproduces how Messier Connexion classified hours historically: the weekly
// first hour of overtime that SparkLog pays at 1.5× (the "hors CCQ" tier) is instead counted
// as REGULAR straight time. Double time (2×) is left exactly as-is. Used only by the parallel
// "Façon Messier" comparison views — never by the authoritative export path.
// ── Day rounding (engine 2.4.0, owner decision 2026-10-14) ─────────────────────────────────
// Each day's paid time (work + return, first unpaid trip removed) is paid to the nearest 15
// minutes, and what rounding gave or took is carried to the next day in a running counter per
// employee (never reset): paid = round15(worked − counter); counter += paid − worked.
//   Mon 8h07 → 8h00, counter −7 (the employer owes 7 min) · Tue 7h53 → 7h53 + 7 = 8h00, counter 0
//   8h08 → 8h15, counter +7 (the employer paid 7 min more).
// Up to 7 minutes rounds down, 8 and more rounds up, so the counter stays within ±7 minutes.
// The minutes added or removed are the END of the day's work: overtime when the day is over
// 8 h, regular time otherwise. Applies from CCQ week 41 (2026-09-27).
export const DAY_ROUNDING = Object.freeze({ stepMinutes: 15, startDate: "2026-09-27" });

export function roundToStep(minutes, stepMinutes = DAY_ROUNDING.stepMinutes) {
  const half = Math.floor((stepMinutes - 1) / 2);
  return Math.floor((minutes + half) / stepMinutes) * stepMinutes;
}

// Paid minutes of each day before rounding: Départ→Fin spans (return included) minus the
// unpaid first trip for employees with that option. Map job_date → minutes.
export function dayPaidMinutes(jobs, { firstTripUnpaid = false } = {}) {
  const sorted = [...(jobs || [])].filter((job) => job?.depart && job?.fin)
    .sort((a, b) => `${a.job_date}${a.depart || ""}${a.id || ""}`.localeCompare(`${b.job_date}${b.depart || ""}${b.id || ""}`));
  const unpaidTrip = firstTripUnpaid ? firstTripUnpaidMinutes(sorted) : new Map();
  const days = new Map();
  for (const job of sorted) {
    days.set(job.job_date, (days.get(job.job_date) || 0) + minutesBetween(job.depart, job.fin) - (unpaidTrip.get(job.id) || 0));
  }
  return days;
}

// The employee's rounding counter, day by day, from the start date. `jobs` = every job that
// counts (one employee). Returns { days: [{ date, worked, paid, delta, balanceBefore,
// balanceAfter }], balanceBefore(date), balanceAfter(date) }.
export function buildDayRounding(jobs, { firstTripUnpaid = false, startDate = DAY_ROUNDING.startDate, stepMinutes = DAY_ROUNDING.stepMinutes, openingBalance = 0 } = {}) {
  const worked = dayPaidMinutes((jobs || []).filter((job) => String(job?.job_date || "") >= startDate), { firstTripUnpaid });
  const days = [];
  let balance = openingBalance;
  for (const [date, minutes] of [...worked.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (minutes <= 0) continue;
    const paid = Math.max(0, roundToStep(minutes - balance, stepMinutes));
    const delta = paid - minutes;
    days.push({ date, worked: minutes, paid, delta, balanceBefore: balance, balanceAfter: balance + delta });
    balance += delta;
  }
  const lastBefore = (date) => {
    let found = null;
    for (const day of days) {
      if (day.date < date) found = day; else break;
    }
    return found;
  };
  return Object.freeze({
    startDate,
    stepMinutes,
    days,
    balanceBefore: (date) => lastBefore(date)?.balanceAfter ?? openingBalance,
    balanceAfter: (date) => days.find((day) => day.date === date)?.balanceAfter ?? lastBefore(date)?.balanceAfter ?? openingBalance,
  });
}

// Rounding minutes per job for the days in `sortedJobs`: the day's delta, taken from (or added
// to) the work of its LAST jobs. Map job.id → minutes (+/−).
function roundingAdjustments(sortedJobs, paidSpan, rounding) {
  const adjust = new Map();
  if (!rounding) return adjust;
  const byDay = new Map();
  for (const job of sortedJobs) {
    if (String(job.job_date) < rounding.startDate || !job.depart || !job.fin) continue;
    if (!byDay.has(job.job_date)) byDay.set(job.job_date, []);
    byDay.get(job.job_date).push(job);
  }
  for (const [date, dayJobs] of byDay) {
    const worked = dayJobs.reduce((sum, job) => sum + paidSpan(job), 0);
    if (worked <= 0) continue;
    const paid = Math.max(0, roundToStep(worked - rounding.balanceBefore(date), rounding.stepMinutes));
    let delta = paid - worked;
    if (delta > 0) {
      const last = dayJobs[dayJobs.length - 1];
      adjust.set(last.id, delta);
      continue;
    }
    for (let i = dayJobs.length - 1; i >= 0 && delta < 0; i -= 1) {
      const job = dayJobs[i];
      const span = paidSpan(job);
      const work = Math.max(0, span - jobReturnMinutes(job, span));
      const take = Math.min(work, -delta);
      if (take > 0) adjust.set(job.id, -take);
      delta += take;
    }
  }
  return adjust;
}

export function calculatePayrollEntries(jobs, { firstOtHourDouble = false, returnWithBenefitsTo8h = false, messierMethod = false, firstTripUnpaid = false, holidayDates = [], rounding = null } = {}) {
  const holidays = new Set([...(holidayDates || [])].map((d) => String(d).slice(0, 10)));
  // "regular" Monday–Friday; "saturday" all overtime; "double" Sunday / holiday at 2×.
  const dayKind = (jobDate) => {
    const day = dayOfWeek(jobDate);
    if (day === 0 || holidays.has(String(jobDate).slice(0, 10))) return "double";
    return day === 6 ? "saturday" : "regular";
  };
  const sorted = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}${a.id || ""}`.localeCompare(`${b.job_date}${b.depart || ""}${b.id || ""}`));
  // Pre-pass: the day's WORK minutes (paid span minus return). With returnWithBenefitsTo8h,
  // the return time that fits under 8h once all of the day's work is counted keeps its
  // benefits; work always takes the 8h first, whatever the job order.
  const unpaidTrip = firstTripUnpaid ? firstTripUnpaidMinutes(sorted) : new Map();
  const paidSpan = (job) => minutesBetween(job.depart, job.fin) - (unpaidTrip.get(job.id) || 0);
  // `rounding` (buildDayRounding result): each day paid to the nearest 15 minutes, see above.
  const roundingAdjust = roundingAdjustments(sorted, paidSpan, rounding);
  const dayWorkTotal = new Map();
  for (const job of sorted) {
    const span = paidSpan(job);
    dayWorkTotal.set(job.job_date, (dayWorkTotal.get(job.job_date) || 0) + span - jobReturnMinutes(job, span) + (roundingAdjust.get(job.id) || 0));
  }
  const dayReturnBenefitRoom = new Map(); // job_date -> return minutes still payable with benefits
  if (returnWithBenefitsTo8h) {
    for (const [date, work] of dayWorkTotal) {
      if (dayKind(date) === "regular") dayReturnBenefitRoom.set(date, Math.max(0, 480 - work));
    }
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

    const roundingMinutes = roundingAdjust.get(job.id) || 0;
    const spanMinutes = paidSpan(job);
    const returnMinutes = jobReturnMinutes(job, spanMinutes);
    const workMinutes = spanMinutes - returnMinutes + roundingMinutes;
    const returnBenefitRoom = dayReturnBenefitRoom.get(job.job_date) || 0;
    const returnWithBenefitMinutes = Math.min(returnMinutes, returnBenefitRoom);
    if (returnWithBenefitMinutes) dayReturnBenefitRoom.set(job.job_date, returnBenefitRoom - returnWithBenefitMinutes);
    let returnNoBenefitMinutes = returnMinutes - returnWithBenefitMinutes;

    const kind = dayKind(job.job_date);
    const regularRoom = kind === "regular" ? Math.max(0, 480 - priorDayWork) : 0;
    const workRegularMinutes = Math.min(workMinutes, regularRoom);
    const overtimeWorkMinutes = workMinutes - workRegularMinutes;
    // Return time with benefits is paid as regular time; the pre-pass keeps it within 8h.
    let regularWorkMinutes = workRegularMinutes + returnWithBenefitMinutes;
    const overtime50Room = firstOtHourDouble || kind === "double" ? 0 : Math.max(0, 60 - priorWeekOvertime);
    let overtime50Minutes = Math.min(overtimeWorkMinutes, overtime50Room);
    let overtime100Minutes = overtimeWorkMinutes - overtime50Minutes;
    // Façon Messier: the "hors CCQ" hours are the paid non-CCQ hours (the return-to-shop time
    // carved out with no CCQ benefits). Historically Messier counted those toward the CCQ
    // regular — so convert non-CCQ hours into regular (temps CCQ) up to a full 40h/week.
    // Overtime (1.5× / double) is not touched. Any non-CCQ hours past 40h/week stay non-CCQ.
    // (Simon's real week 39: 39h reg + 1.25h non-CCQ → 1h converts → 40 / 0.25 / 1.75.)
    let messierConverted = 0;
    if (messierMethod && returnNoBenefitMinutes > 0) {
      const weekRoom = Math.max(0, 2400 - priorWeekRegular - regularWorkMinutes);
      messierConverted = Math.min(returnNoBenefitMinutes, weekRoom);
      returnNoBenefitMinutes -= messierConverted;
      regularWorkMinutes += messierConverted;
    }
    // Legacy field: return travel was never paid as separate minutes on top of the span.
    // It is kept at 0; the split above re-categorises minutes that are already in the
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
      totalPaidMinutes: spanMinutes + returnRegularMinutes + roundingMinutes,
      roundingMinutes,
      ...kilometres,
    });
    // Count Messier-converted non-CCQ minutes as day work so the 8h/day cap holds across jobs.
    dayWorkMinutes.set(job.job_date, priorDayWork + workMinutes + messierConverted);
    // Sunday/holiday double time does not use the week's 1.5× hour.
    weekOvertimeMinutes.set(wk, priorWeekOvertime + (kind === "double" ? 0 : overtimeWorkMinutes));
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
      roundingMinutes: 0,
      clientKm: 0,
      returnKm: 0,
      totalKm: 0,
      jobCount: 0,
    };
    for (const key of ["regularWorkMinutes", "overtime50Minutes", "overtime100Minutes", "overtimeWorkMinutes", "returnRegularMinutes", "returnNoBenefitMinutes", "totalPaidMinutes", "roundingMinutes", "clientKm", "returnKm", "totalKm"]) {
      day[key] += entry[key];
    }
    day.jobCount += 1;
    days.set(date, day);
  }
  return days;
}

// Supper (30 $), owner decision 2026-10-13 (revised the same day): due on a weekday once
// the day has 2 h 15 of overtime (at 1.5× or 2×, both count), i.e. at least 10 h 15 of paid
// WORK. Return-to-warehouse time never counts (it is never overtime). `dailyWorkMinutes` is
// the day's paid work WITHOUT return (see dayWorkMinutesWithoutReturn); the database twin is
// reconcile_overtime_meal (migration 0086).
export const MEAL_OVERTIME_MINUTES = 135;
export const MEAL_AFTER_DAILY_WORK_MINUTES = 480 + MEAL_OVERTIME_MINUTES;
export function isMealEligible({ jobDate, dailyWorkMinutes }) {
  const weekday = dayOfWeek(jobDate);
  return weekday !== null && weekday !== 0 && weekday !== 6 && (Number(dailyWorkMinutes) || 0) >= MEAL_AFTER_DAILY_WORK_MINUTES;
}

// The day's paid work without return time: each job's Départ→Fin span minus its return
// minutes, minus the unpaid first trip for an employee with that option.
export function dayWorkMinutesWithoutReturn(dayJobs, { firstTripUnpaid = false } = {}) {
  const jobs = dayJobs || [];
  const work = jobs.reduce((total, job) => {
    const span = minutesBetween(job.depart, job.fin);
    return total + span - jobReturnMinutes(job, span);
  }, 0);
  return Math.max(0, work - (firstTripUnpaid ? dayFirstTripUnpaidMinutes(jobs) : 0));
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
