// Employer cost of one employee for one CCQ week, from the payroll calculation itself
// (computeEmployeeWeekTalon: the same hours, gross, 13 %, statutory employer contributions and CCQ
// employer benefits as Talons and DAS). Coûts, Rapports › Semaine / Mois and the printed weekly
// summary all read it, so their totals agree with the talons. ⚠️ Draft rule set: an estimate.
import { calculatePayrollEntries, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";
import { computeEmployeeWeekTalon, DEFAULT_EMPLOYER, snapshotFromRow } from "@/payroll/employee-week";
import { isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import { fixedWeeklyHours, isFixedPayWeek } from "@/lib/fixed-pay";
import { weeklyPhoneAmount, weeklyStorageAmount } from "@/lib/weekly-allowances";

// Jobs a cost estimate counts: submitted, returned for correction (updated) and approved — not
// drafts. Same list as the printed weekly summary.
export const COST_JOB_STATUSES = Object.freeze(["submitted", "updated", "approved"]);

// CCQ level → the per-hour rate column of employer_contributions.
export const LEVEL_RATE_KEY = Object.freeze({
  compagnon: "rate_compagnon",
  apprenti_4: "rate_apprenti_4",
  apprenti_3: "rate_apprenti_3",
  apprenti_2: "rate_apprenti_2",
  apprenti_1: "rate_apprenti_1",
});

// employer_contributions codes the engine already computes (statutory contributions, the CCQ
// employer benefits and the safety-equipment allowance). The remaining per-hour rates of that table
// (prélèvement CCQ employeur, AECQ/ACQ, taxe d'assurance, fonds divers, autres) are added on top, so
// nothing is counted twice.
export const ENGINE_CONTRIBUTION_CODES = new Set(["rrq", "ei", "rqap", "fss", "cnesst", "benefits", "safety_equip"]);

const n = (v) => Number(v) || 0;
const round2 = (x) => Math.round(x * 100) / 100;
const sumOf = (list) => list.reduce((s, x) => s + n(x), 0);

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Saturday ending the CCQ week (Sunday → Saturday) of a date.
export const weekEndOf = (date) => addDays(date, 6 - new Date(`${date}T12:00:00Z`).getUTCDay());

// One payroll employee's week (CCQ tradesperson, or anyone on fixed weekly pay).
export function payrollWeekCost({
  profile, jobs = [], weekStart, opening = {}, holidayDates = [], employer = DEFAULT_EMPLOYER, taxProfile = null,
  contributions = [], rounding = null, messierMethod = true,
}) {
  const talon = computeEmployeeWeekTalon({
    profile, jobs, opening, frequency: "weekly", includePhone: true, includeStorage: true,
    weekDate: weekStart, holidayDates, employer, taxProfile, rounding, messierMethod,
  });
  const { result, ccqAmounts: ccq, reimb, hours } = talon;
  const empr = result.employer;
  // Fixed weekly pay has no CCQ layer: no per-hour CCQ contributions either.
  const rateKey = talon.fixedPay ? null : LEVEL_RATE_KEY[profile?.apprentice_level] || null;
  const otherCcq = rateKey
    ? contributions
      .filter((c) => !ENGINE_CONTRIBUTION_CODES.has(c.code))
      .map((c) => ({ code: c.code, label: c.label, rate: n(c[rateKey]), amount: round2(n(c[rateKey]) * hours.totalHours) }))
      .filter((c) => c.amount)
    : [];
  const statutory = {
    rrq: n(empr.rrq), ei: n(empr.ei), rqap: n(empr.rqap), fss: n(empr.fss),
    cnt: n(empr.labourStandards), cnesst: n(empr.cnesst), fdrcmo: n(empr.workforceFund),
  };
  const statutoryTotal = sumOf(Object.values(statutory));
  const ccqBenefits = n(ccq?.employerSocialBenefit);
  const otherCcqTotal = sumOf(otherCcq.map((c) => c.amount));
  const salary = n(result.gross?.total);
  const vacation = n(ccq?.vacation);
  const reimbursements = { km: n(reimb.km), phone: n(reimb.phone), storage: n(reimb.storage), safety: n(reimb.safety) };
  const reimbursementTotal = sumOf(Object.values(reimbursements));
  const contribTotal = statutoryTotal + ccqBenefits + otherCcqTotal;
  return {
    talon, salary, vacation, statutory, statutoryTotal, ccqBenefits, otherCcq, otherCcqTotal, contribTotal,
    reimbursements, reimbursementTotal,
    // Lines for the detail of the cost screens.
    contribLines: [
      ["rrq", "RRQ"], ["ei", "AE"], ["rqap", "RQAP"], ["fss", "FSS"], ["cnt", "CNT"], ["cnesst", "CNESST"], ["fdrcmo", "FDRCMO"],
    ].map(([code, label]) => ({ code, label, amount: statutory[code] }))
      .concat([{ code: "benefits", label: "Avantages sociaux CCQ", amount: ccqBenefits }], otherCcq)
      .filter((line) => line.amount),
    // Without supper and parking, which are claims paid apart from the stub.
    total: salary + vacation + contribTotal + reimbursementTotal,
  };
}

// Office, owner and subcontractor (not on the CCQ payroll here, like the DAS screen): hours at the
// hourly rate frozen on the job, plus km and the weekly allowances; no contributions, no 13 %.
// Subcontractor: simple rate ≤ 8 h and return time, the negotiated double rate beyond.
export function nonPayrollWeekCost({ profile, entries }) {
  const sub = isSubcontractorRole(profile?.role);
  const doubleRate = n(profile?.hourly_rate_double);
  let labor = 0, km = 0;
  for (const e of entries.values()) {
    const base = n(e.job?.hourly_rate_snapshot ?? profile?.hourly_rate);
    const premium = n(e.job?.team_leader_premium_snapshot ?? profile?.team_leader_premium);
    if (sub) {
      labor += base * ((e.regularWorkMinutes + e.returnRegularMinutes + e.returnNoBenefitMinutes) / 60) + doubleRate * (e.overtime100Minutes / 60);
    } else {
      labor += (base + premium) * ((e.regularWorkMinutes + e.returnRegularMinutes) / 60)
        + base * ((e.overtime50Minutes / 60) * 1.5 + (e.overtime100Minutes / 60) * 2 + e.returnNoBenefitMinutes / 60);
    }
    km += e.totalKm * n(e.job?.km_rate_snapshot ?? profile?.km_rate);
  }
  const phone = weeklyPhoneAmount(profile);
  const storage = weeklyStorageAmount(profile);
  return { labor, km, phone, storage, total: labor + km + phone + storage };
}

// Opening YTD of an employee before a week, as the printed summary and the talons take it: the last
// comptabilisé week of the same tax year (DAS follow the pay date, the Thursday after the week), else
// the year's seed (payroll_ytd). `ledger` and `seeds` rows as stored.
export function openingLookup({ ledger = [], seeds = [] }) {
  const byUser = new Map();
  for (const row of ledger) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row);
  }
  for (const rows of byUser.values()) rows.sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
  const seedFor = new Map(seeds.map((row) => [`${row.user_id}|${row.tax_year}`, row]));
  return (userId, weekStart) => {
    const taxYear = Number(addDays(weekEndOf(weekStart), 5).slice(0, 4));
    const before = (byUser.get(userId) || []).filter((row) => Number(row.tax_year) === taxYear && String(row.period_end) < weekStart);
    return snapshotFromRow(before[before.length - 1] || seedFor.get(`${userId}|${taxYear}`) || null);
  };
}

// The tax years whose opening a range can need (pay date = week end + 5 days).
export function taxYearsFor(start, end) {
  const first = Number(addDays(weekEndOf(start), 5).slice(0, 4));
  const last = Number(addDays(weekEndOf(end), 5).slice(0, 4));
  const years = [];
  for (let y = first; y <= last; y += 1) years.push(y);
  return years;
}

// Cost of every employee × CCQ week of a range, one row each. `jobs` = the range's jobs (any status:
// only COST_JOB_STATUSES count); `meals` / `parking` = claims already filtered to the counted statuses.
// A week is listed when the employee has counted jobs in it, or is on fixed weekly pay that week.
export function weeklyCosts({
  start, end, profiles = [], jobs = [], meals = [], parking = [], contributions = [], holidayDates = [],
  employer = DEFAULT_EMPLOYER, taxProfiles = new Map(), openingFor = () => ({}), roundingFor = () => null,
}) {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const cells = new Map(); // `${userId}|${weekEnd}` → { userId, weekEnd, jobs, meals, parking }
  const cell = (userId, weekEnd) => {
    const key = `${userId}|${weekEnd}`;
    if (!cells.has(key)) cells.set(key, { userId, weekEnd, jobs: [], meals: 0, parking: 0 });
    return cells.get(key);
  };
  for (const job of jobs) {
    if (!job.job_date || !COST_JOB_STATUSES.includes(job.status) || job.job_date < start || job.job_date > end) continue;
    if (profileById.has(job.user_id)) cell(job.user_id, weekEndOf(job.job_date)).jobs.push(job);
  }
  for (const [userId, taxProfile] of taxProfiles) {
    if (!profileById.has(userId) || !fixedWeeklyHours(taxProfile)) continue;
    for (let weekEnd = weekEndOf(start); addDays(weekEnd, -6) <= end; weekEnd = addDays(weekEnd, 7)) {
      if (isFixedPayWeek(taxProfile, weekEnd)) cell(userId, weekEnd);
    }
  }
  // Supper: a CCQ allowance (not for office / owner / subcontractor). Claims land in a week with work.
  for (const m of meals) {
    if (!m.job_date || isNonCcqRole(profileById.get(m.user_id)?.role)) continue;
    const c = cells.get(`${m.user_id}|${weekEndOf(m.job_date)}`);
    if (c) c.meals += n(m.amount);
  }
  for (const p of parking) {
    if (!p.job_date) continue;
    const c = cells.get(`${p.user_id}|${weekEndOf(p.job_date)}`);
    if (c) c.parking += n(p.amount);
  }

  const rows = [];
  for (const c of cells.values()) {
    const profile = profileById.get(c.userId);
    const weekStart = addDays(c.weekEnd, -6);
    const taxProfile = taxProfiles.get(c.userId) || null;
    const fixed = isFixedPayWeek(taxProfile, c.weekEnd) && fixedWeeklyHours(taxProfile) > 0;
    const rounding = roundingFor(c.userId);
    const entries = calculatePayrollEntries(c.jobs, { ...overtimeOptionsFromProfile(profile), messierMethod: true, holidayDates, rounding });
    let regularMinutes = 0, ot50Minutes = 0, ot100Minutes = 0, returnNoBenefitMinutes = 0, workedMinutes = 0, otJobs = 0;
    for (const e of entries.values()) {
      regularMinutes += e.regularWorkMinutes + e.returnRegularMinutes;
      ot50Minutes += e.overtime50Minutes;
      ot100Minutes += e.overtime100Minutes;
      returnNoBenefitMinutes += e.returnNoBenefitMinutes;
      workedMinutes += e.regularWorkMinutes + e.overtimeWorkMinutes;
      if (e.overtimeWorkMinutes > 0) otJobs += 1;
    }
    const payroll = fixed || !isNonCcqRole(profile?.role);
    let cost;
    if (payroll) {
      const p = payrollWeekCost({
        profile, jobs: c.jobs, weekStart, opening: openingFor(c.userId, weekStart) || {}, holidayDates, employer,
        taxProfile, contributions, rounding,
      });
      if (fixed) {
        const h = p.talon.hours.totalHours * 60;
        regularMinutes = h; ot50Minutes = 0; ot100Minutes = 0; returnNoBenefitMinutes = 0; workedMinutes = h;
      }
      cost = {
        labor: p.salary, conges: p.vacation, contribLines: p.contribLines, contribTotal: p.contribTotal,
        km: p.reimbursements.km, phone: p.reimbursements.phone, storage: p.reimbursements.storage, safety: p.reimbursements.safety,
        reviewReasons: p.talon.result.reviewReasons || [],
      };
    } else {
      const p = nonPayrollWeekCost({ profile, entries });
      cost = { labor: p.labor, conges: 0, contribLines: [], contribTotal: 0, km: p.km, phone: p.phone, storage: p.storage, safety: 0, reviewReasons: [] };
    }
    const expenses = cost.km + cost.phone + cost.storage + cost.safety + c.meals + c.parking;
    rows.push({
      userId: c.userId, weekEnd: c.weekEnd, weekStart, jobs: c.jobs, fixedPay: fixed, payroll,
      category: isSubcontractorRole(profile?.role) ? "subcontractor" : isNonCcqRole(profile?.role) ? "nonCcq" : "ccq",
      minutes: { regular: regularMinutes, ot50: ot50Minutes, ot100: ot100Minutes, returnNoBenefit: returnNoBenefitMinutes, worked: workedMinutes },
      otJobs, ...cost, meals: c.meals, parking: c.parking, expenses,
      total: cost.labor + cost.conges + cost.contribTotal + expenses,
    });
  }
  return rows.sort((a, b) => a.weekEnd.localeCompare(b.weekEnd) || String(a.userId).localeCompare(String(b.userId)));
}

// Coûts: the rows of weeklyCosts added up per employee (contribution lines merged by code), most
// expensive first.
export function costsByEmployee(rows, profiles = []) {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.userId)) {
      const profile = profileById.get(r.userId);
      byUser.set(r.userId, {
        userId: r.userId,
        name: profile?.full_name || profile?.email || String(r.userId).slice(0, 8),
        category: r.category, fixedPay: false, weeks: 0,
        hasRate: n(profile?.hourly_rate) > 0,
        hasLevel: Boolean(LEVEL_RATE_KEY[profile?.apprentice_level]),
        premium: n(profile?.team_leader_premium) + n(profile?.team_leader_premium_ccq),
        regularMinutes: 0, overtimeMinutes: 0, returnNoBenefitMinutes: 0,
        labor: 0, conges: 0, contribTotal: 0, lines: new Map(),
        km: 0, phone: 0, storage: 0, safety: 0, meals: 0, parking: 0, expenses: 0, total: 0, reviewReasons: new Set(),
      });
    }
    const u = byUser.get(r.userId);
    u.weeks += 1;
    u.fixedPay = u.fixedPay || r.fixedPay;
    u.regularMinutes += r.minutes.regular;
    u.overtimeMinutes += r.minutes.ot50 + r.minutes.ot100;
    u.returnNoBenefitMinutes += r.minutes.returnNoBenefit;
    for (const key of ["labor", "conges", "contribTotal", "km", "phone", "storage", "safety", "meals", "parking", "expenses", "total"]) u[key] += n(r[key]);
    for (const line of r.contribLines) {
      const current = u.lines.get(line.code) || { code: line.code, label: line.label, amount: 0 };
      current.amount += n(line.amount);
      u.lines.set(line.code, current);
    }
    for (const reason of r.reviewReasons || []) u.reviewReasons.add(reason);
  }
  return [...byUser.values()]
    .map(({ lines, reviewReasons, ...u }) => ({ ...u, contribLines: [...lines.values()], reviewReasons: [...reviewReasons] }))
    .sort((a, b) => b.total - a.total);
}
