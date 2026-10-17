// Printable weekly summary (Rapports › Période › Vue semaine › Imprimer): every employee's
// jobs for one CCQ week (OT number, time, km), the week recap per employee, the employee pay,
// the employer cost and the DAS, plus the week totals.
//
// The pay, employer and DAS figures come from computeEmployeeWeekTalon — the same calculation
// as Talons and DAS — so the printed week agrees with those screens. ⚠️ Draft rule set: every
// amount is an estimate that requires payroll review, never a filing.
import { calculatePayrollEntries, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";
import { computeEmployeeWeekTalon, DEFAULT_EMPLOYER } from "@/payroll/employee-week";
import { payTotals } from "@/lib/payroll-closing";
import { isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import { EMPLOYER } from "@/lib/paystub";
import { fixedWeeklyHours, isFixedPayWeek } from "@/lib/fixed-pay";

// Drafts ('saved') are not work yet. 'updated' and 'submitted' are printed but flagged as not
// approved: their amounts can still change.
export const REPORT_JOB_STATUSES = ["submitted", "updated", "approved"];

// employer_contributions codes the engine already computes (statutory contributions, the CCQ
// employer benefits and the safety-equipment allowance). The remaining per-hour rates of that
// table (prélèvement CCQ employeur, AECQ/ACQ, taxe d'assurance, fonds divers, autres) are added
// on top, so nothing is counted twice.
const ENGINE_CONTRIBUTION_CODES = new Set(["rrq", "ei", "rqap", "fss", "cnesst", "benefits", "safety_equip"]);

const LEVEL_RATE_KEY = {
  compagnon: "rate_compagnon",
  apprenti_4: "rate_apprenti_4",
  apprenti_3: "rate_apprenti_3",
  apprenti_2: "rate_apprenti_2",
  apprenti_1: "rate_apprenti_1",
};

const n = (v) => Number(v) || 0;
const round2 = (x) => Math.round(x * 100) / 100;
const sum = (list, key) => list.reduce((s, x) => s + n(typeof key === "function" ? key(x) : x[key]), 0);
const otKey = (ot) => String(ot ?? "").trim();

function jobRows(jobs, entries) {
  return [...jobs]
    .sort((a, b) => `${a.job_date}${a.depart || ""}${a.id}`.localeCompare(`${b.job_date}${b.depart || ""}${b.id}`))
    .map((job) => {
      const e = entries.get(job.id) || {};
      return {
        id: job.id,
        date: job.job_date,
        ot: otKey(job.ot),
        depart: String(job.depart || "").slice(0, 5),
        arrivee: String(job.arrivee || "").slice(0, 5),
        fin: String(job.fin || "").slice(0, 5),
        returnMinutes: n(job.return_time_minutes),
        regularMinutes: n(e.regularWorkMinutes),
        ot50Minutes: n(e.overtime50Minutes),
        ot100Minutes: n(e.overtime100Minutes),
        returnNoBenefitMinutes: n(e.returnNoBenefitMinutes),
        paidMinutes: n(e.regularWorkMinutes) + n(e.overtime50Minutes) + n(e.overtime100Minutes) + n(e.returnNoBenefitMinutes),
        roundingMinutes: n(e.roundingMinutes),
        km: n(e.totalKm),
        status: job.status,
      };
    });
}

// One employee's CCQ pay for the week (null for non-CCQ roles, like the DAS screen).
function employeePay({ profile, jobs, week, opening, holidayDates, employer, taxProfile, contributions, meals, parking, rounding, messierMethod }) {
  const talon = computeEmployeeWeekTalon({
    profile, jobs, opening, frequency: "weekly", includePhone: true, includeStorage: true,
    weekDate: week.start, holidayDates, employer, taxProfile, rounding, messierMethod,
  });
  const { result, ccqAmounts: ccq, reimb, hours } = talon;
  const totals = payTotals(result, ccq, reimb);
  const emp = result.employee, empr = result.employer, das = result.das;

  // Fixed weekly pay has no CCQ layer: no per-hour CCQ contributions either.
  const rateKey = talon.fixedPay ? null : LEVEL_RATE_KEY[profile?.apprentice_level] || null;
  const otherCcq = rateKey
    ? contributions
      .filter((c) => !ENGINE_CONTRIBUTION_CODES.has(c.code))
      .map((c) => ({ code: c.code, label: c.label, rate: n(c[rateKey]), amount: round2(n(c[rateKey]) * hours.totalHours) }))
      .filter((c) => c.amount)
    : [];

  const salary = n(result.gross?.total);
  const vacation = n(ccq?.vacation);
  const ccqWithheld = n(ccq?.netWithholdings);
  const deductions = {
    federalTax: n(emp.federalTax),
    quebecTax: n(emp.quebecTax),
    rrq: n(emp.rrq?.total),
    ei: n(emp.ei),
    rqap: n(emp.rqap),
    ccq: ccqWithheld, // retraite, MÉDIC, cotisation syndicale, prélèvement, caisse d'éducation
  };
  const reimbursements = {
    km: n(reimb.km), phone: n(reimb.phone), storage: n(reimb.storage), safety: n(reimb.safety),
    meals, parking,
  };
  const reimbursementTotal = sum(Object.values(reimbursements), (v) => v);
  const statutory = {
    rrq: n(empr.rrq), ei: n(empr.ei), rqap: n(empr.rqap), fss: n(empr.fss),
    cnt: n(empr.labourStandards), cnesst: n(empr.cnesst), fdrcmo: n(empr.workforceFund),
  };
  const statutoryTotal = sum(Object.values(statutory), (v) => v);
  const ccqBenefits = n(ccq?.employerSocialBenefit);
  const otherCcqTotal = sum(otherCcq, "amount");
  const employerCost = salary + vacation + statutoryTotal + ccqBenefits + otherCcqTotal + reimbursementTotal;

  return {
    salary, vacation,
    deductions, totalDeductions: sum(Object.values(deductions), (v) => v),
    // Net deposited = pay − deductions (+ safety allowance) + km, phone, storage. Supper and parking
    // are reimbursed apart from the stub.
    net: totals.netPlusReimb,
    reimbursements, reimbursementTotal,
    employer: { statutory, statutoryTotal, ccqBenefits, otherCcq, otherCcqTotal, total: employerCost },
    das: { arc: n(das.arc), quebec: n(das.quebec), total: n(das.total) },
    reviewReasons: result.reviewReasons || [],
  };
}

// week: { start, end } (YYYY-MM-DD, Sunday → Saturday) + weekNo. openingFor(userId) → opening
// YTD snapshot for that employee before the week (ledger or payroll_ytd seed).
export function buildWeeklyReport({
  week, profiles = [], jobs = [], meals = [], parking = [], contributions = [], holidayDates = [],
  employer = DEFAULT_EMPLOYER, taxProfiles = new Map(), openingFor = () => ({}), roundingFor = () => null,
  // Same hours as the talons: the Messier method is the payroll default (Talons, DAS, Paie de la semaine).
  messierMethod = true,
}) {
  const inWeek = (date) => date >= week.start && date <= week.end;
  const weekJobs = jobs.filter((j) => inWeek(j.job_date) && REPORT_JOB_STATUSES.includes(j.status));
  const jobsByUser = new Map();
  for (const job of weekJobs) {
    if (!jobsByUser.has(job.user_id)) jobsByUser.set(job.user_id, []);
    jobsByUser.get(job.user_id).push(job);
  }
  const amountByUser = (rows) => {
    const m = new Map();
    for (const r of rows) if (inWeek(r.job_date)) m.set(r.user_id, n(m.get(r.user_id)) + n(r.amount));
    return m;
  };
  const mealByUser = amountByUser(meals);
  const parkingByUser = amountByUser(parking);

  const employees = [];
  const sorted = [...profiles].sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "fr"));
  for (const profile of sorted) {
    const ujobs = jobsByUser.get(profile.id) || [];
    // Fixed weekly pay (Paramètres › Paie): paid every week from its start date, with or without jobs.
    const taxProfile = taxProfiles.get(profile.id);
    const fixedHours = isFixedPayWeek(taxProfile, week.end) ? fixedWeeklyHours(taxProfile) : 0;
    if (!ujobs.length && !fixedHours) continue;
    const rounding = roundingFor(profile.id);
    const entries = calculatePayrollEntries(ujobs, { ...overtimeOptionsFromProfile(profile), messierMethod, holidayDates, rounding });
    const rows = jobRows(ujobs, entries);
    const nonCcq = isNonCcqRole(profile.role);
    // Supper is a CCQ allowance (PeriodSummary/Coûts count it for CCQ employees only).
    const meals = nonCcq ? 0 : n(mealByUser.get(profile.id));
    const parkingAmount = n(parkingByUser.get(profile.id));
    const hours = {
      regularMinutes: sum(rows, "regularMinutes"),
      ot50Minutes: sum(rows, "ot50Minutes"),
      ot100Minutes: sum(rows, "ot100Minutes"),
      returnNoBenefitMinutes: sum(rows, "returnNoBenefitMinutes"),
      paidMinutes: sum(rows, "paidMinutes"),
      roundingMinutes: sum(rows, "roundingMinutes"),
      km: sum(rows, "km"),
    };
    // Fixed pay: the week pays the fixed hours (regular), not the jobs' time.
    if (fixedHours) {
      Object.assign(hours, { regularMinutes: fixedHours * 60, ot50Minutes: 0, ot100Minutes: 0, returnNoBenefitMinutes: 0, paidMinutes: fixedHours * 60, roundingMinutes: 0 });
    }
    // Heures CCQ = regular (return with benefits included) + 1.5× + 2×, as declared on the CCQ
    // report. Hors CCQ = return-to-shop time without benefits; every hour of a non-CCQ role or of fixed pay.
    hours.ccqMinutes = nonCcq || fixedHours ? 0 : hours.regularMinutes + hours.ot50Minutes + hours.ot100Minutes;
    hours.nonCcqMinutes = hours.paidMinutes - hours.ccqMinutes;
    let pay = null;
    if (!nonCcq || fixedHours) {
      pay = employeePay({
        profile, jobs: fixedHours ? ujobs.filter((j) => j.status === "approved") : ujobs, week, opening: openingFor(profile.id) || {}, holidayDates, employer,
        taxProfile, contributions, meals, parking: parkingAmount, rounding, messierMethod,
      });
    }
    employees.push({
      id: profile.id,
      name: profile.full_name || profile.id,
      employeeNumber: profile.employee_number || "",
      level: profile.apprentice_level || "",
      role: profile.role,
      category: isSubcontractorRole(profile.role) ? "subcontractor" : nonCcq ? "nonCcq" : "ccq",
      fixedHours,
      jobs: rows,
      hours,
      meals,
      parking: parkingAmount,
      pendingJobs: rows.filter((r) => r.status !== "approved").length,
      roundingBalance: rounding ? rounding.balanceAfter(week.end) : null,
      pay,
    });
  }

  const paid = employees.filter((e) => e.pay);
  const totals = {
    employees: employees.length,
    jobs: sum(employees, (e) => e.jobs.length),
    paidMinutes: sum(employees, (e) => e.hours.paidMinutes),
    ccqMinutes: sum(employees, (e) => e.hours.ccqMinutes),
    nonCcqMinutes: sum(employees, (e) => e.hours.nonCcqMinutes),
    ot50Minutes: sum(employees, (e) => e.hours.ot50Minutes),
    ot100Minutes: sum(employees, (e) => e.hours.ot100Minutes),
    km: sum(employees, (e) => e.hours.km),
    salary: sum(paid, (e) => e.pay.salary),
    totalDeductions: sum(paid, (e) => e.pay.totalDeductions),
    net: sum(paid, (e) => e.pay.net),
    dasArc: sum(paid, (e) => e.pay.das.arc),
    dasQuebec: sum(paid, (e) => e.pay.das.quebec),
    dasTotal: sum(paid, (e) => e.pay.das.total),
    employerCost: sum(paid, (e) => e.pay.employer.total),
    pendingJobs: sum(employees, (e) => e.pendingJobs),
  };
  const reviewReasons = [...new Set(paid.flatMap((e) => e.pay.reviewReasons))];

  return { week, employees, totals, reviewReasons };
}

// ── Printable HTML ───────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtMoney = (v) => `${n(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
export const fmtHM = (minutes) => {
  const m = Math.round(n(minutes));
  if (!m) return "—";
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};
const signedMinutes = (m) => {
  const v = Math.round(n(m));
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} min`;
};
const fmtKm = (km) => (n(km) ? `${Math.round(n(km))}` : "—");
const STATUS_LABEL = { approved: "approuvé", submitted: "soumis", updated: "modifié" };
const LEVEL_LABEL = { compagnon: "Compagnon", apprenti_1: "Apprenti 1", apprenti_2: "Apprenti 2", apprenti_3: "Apprenti 3", apprenti_4: "Apprenti 4" };
const CATEGORY_NOTE = {
  nonCcq: "Hors CCQ : heures seulement, la paie n'est pas calculée ici (comme l'écran DAS).",
  subcontractor: "Sous-traitant : facturé par l'entreprise, aucune paie ni DAS.",
};
// The engine's review reasons, in French. The draft rule set is already stated in the header.
function reviewReasonFr(reason) {
  if (/^Rule set is unvalidated/.test(reason)) return null;
  if (/^CNESST rate not provided/.test(reason)) return "taux CNESST non saisi (Configuration › Paramètres › Paie).";
  const unknown = /^Unknown earning type\(s\): (.*)\.$/.exec(reason);
  if (unknown) return `type(s) de gain inconnu(s) : ${unknown[1]}.`;
  return reason;
}
const dayLabel = (date) => {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString("fr-CA", { weekday: "short", day: "2-digit", month: "short" });
};

function line(label, value, cls = "") {
  return `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
}

function employeeHtml(emp) {
  const jobsHtml = emp.jobs.map((r) => `
    <tr>
      <td>${esc(dayLabel(r.date))}</td>
      <td class="ot">${esc(r.ot || "—")}</td>
      <td>${esc(r.depart || "—")}</td><td>${esc(r.arrivee || "—")}</td><td>${esc(r.fin || "—")}</td>
      <td class="num">${fmtHM(r.regularMinutes)}</td>
      <td class="num">${fmtHM(r.ot50Minutes)}</td>
      <td class="num">${fmtHM(r.ot100Minutes)}</td>
      <td class="num">${fmtHM(r.returnNoBenefitMinutes)}</td>
      <td class="num strong">${fmtHM(r.paidMinutes)}</td>
      <td class="num">${fmtKm(r.km)}</td>
      <td class="${r.status === "approved" ? "" : "warn"}">${esc(STATUS_LABEL[r.status] || r.status)}</td>
    </tr>`).join("");
  const h = emp.hours;
  const sub = [emp.employeeNumber && `N° ${emp.employeeNumber}`, LEVEL_LABEL[emp.level]].filter(Boolean).join(" · ");

  let money;
  if (emp.pay) {
    const p = emp.pay, d = p.deductions, s = p.employer.statutory, r = p.reimbursements;
    money = `
    <div class="cols">
      <table class="kv"><thead><tr><th colspan="2">Paie de l'employé</th></tr></thead><tbody>
        ${line("Salaire brut", fmtMoney(p.salary))}
        ${line("Impôt fédéral", fmtMoney(d.federalTax))}
        ${line("Impôt Québec", fmtMoney(d.quebecTax))}
        ${line("RRQ", fmtMoney(d.rrq))}
        ${line("AE", fmtMoney(d.ei))}
        ${line("RQAP", fmtMoney(d.rqap))}
        ${line("Retenues CCQ (retraite, MÉDIC, syndicat…)", fmtMoney(d.ccq))}
        ${line("Total des retenues", fmtMoney(p.totalDeductions), "sub")}
        ${line("Net versé (avec km et allocations)", fmtMoney(p.net), "total")}
        ${p.reimbursements.meals || p.reimbursements.parking ? line("Souper + stationnement (à part)", fmtMoney(r.meals + r.parking)) : ""}
      </tbody></table>
      <table class="kv"><thead><tr><th colspan="2">Coût employeur</th></tr></thead><tbody>
        ${line("Salaire brut", fmtMoney(p.salary))}
        ${line("Congés CCQ (13 %)", fmtMoney(p.vacation))}
        ${line("Avantages sociaux CCQ", fmtMoney(p.employer.ccqBenefits))}
        ${line("RRQ + AE + RQAP employeur", fmtMoney(s.rrq + s.ei + s.rqap))}
        ${line("FSS", fmtMoney(s.fss))}
        ${line("CNT", fmtMoney(s.cnt))}
        ${line("CNESST", fmtMoney(s.cnesst))}
        ${s.fdrcmo ? line("FDRCMO", fmtMoney(s.fdrcmo)) : ""}
        ${p.employer.otherCcqTotal ? line("Autres cotisations CCQ", fmtMoney(p.employer.otherCcqTotal)) : ""}
        ${line("Remboursements", fmtMoney(p.reimbursementTotal))}
        ${line("Coût total", fmtMoney(p.employer.total), "total")}
      </tbody></table>
      <table class="kv"><thead><tr><th colspan="2">DAS à remettre</th></tr></thead><tbody>
        ${line("ARC — impôt fédéral, AE", fmtMoney(p.das.arc))}
        ${line("Revenu Québec — impôt, RRQ, RQAP, FSS", fmtMoney(p.das.quebec))}
        ${line("Total DAS", fmtMoney(p.das.total), "total")}
      </tbody></table>
    </div>`;
  } else {
    money = `<p class="note">${esc(CATEGORY_NOTE[emp.category] || "")}${emp.parking ? ` Stationnement : ${esc(fmtMoney(emp.parking))}.` : ""}</p>`;
  }

  return `
  <section class="emp">
    <h2>${esc(emp.name)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ""}${emp.pendingJobs ? ` <span class="badge">${emp.pendingJobs} job(s) non approuvée(s)</span>` : ""}</h2>
    <table class="jobs">
      <thead><tr>
        <th>Jour</th><th>N° OT</th><th>Départ</th><th>Arrivée</th><th>Fin</th>
        <th class="num">Rég.</th><th class="num">1,5×</th><th class="num">2×</th><th class="num">Retour s.a.</th>
        <th class="num">Total</th><th class="num">km</th><th>Statut</th>
      </tr></thead>
      <tbody>${jobsHtml}</tbody>
      <tfoot><tr>
        <td colspan="5">Semaine — ${emp.jobs.length} job(s)</td>
        <td class="num">${fmtHM(h.regularMinutes)}</td>
        <td class="num">${fmtHM(h.ot50Minutes)}</td>
        <td class="num">${fmtHM(h.ot100Minutes)}</td>
        <td class="num">${fmtHM(h.returnNoBenefitMinutes)}</td>
        <td class="num">${fmtHM(h.paidMinutes)}</td>
        <td class="num">${fmtKm(h.km)}</td>
        <td></td>
      </tr></tfoot>
    </table>
    ${emp.fixedHours ? `<p class="note">Paie fixe : ${esc(fmtHM(emp.fixedHours * 60))} par semaine au taux horaire, avec ou sans job (sans avantages CCQ) — les heures des jobs ne sont pas payées, leurs km oui.</p>` : ""}
    ${emp.roundingBalance == null || emp.fixedHours ? "" : `<p class="note">Arrondi au 15 min de la semaine : ${esc(signedMinutes(h.roundingMinutes))} · compteur à la fin de la semaine : ${esc(signedMinutes(emp.roundingBalance))} (+ = payé en plus, − = dû à l'employé).</p>`}
    ${money}
  </section>`;
}

const REPORT_STYLES = `
  * { box-sizing: border-box; }
  @page { margin: 10mm; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 11px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 0 0 6px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; margin: 14px 0 4px; }
  .muted { color: #666; font-weight: 400; font-size: 11px; }
  .sub-title { color: #555; margin: 0 0 10px; }
  .warn-box { border: 1px solid #d97706; background: #fffbeb; color: #78350f; border-radius: 6px; padding: 6px 10px; margin: 6px 0 10px; }
  .badge { display: inline-block; border: 1px solid #d97706; color: #92400e; border-radius: 999px; padding: 0 6px; font-size: 10px; font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 6px; }
  .stat { border: 1px solid #ccc; border-radius: 6px; padding: 5px 8px; }
  .stat .l { font-size: 9px; text-transform: uppercase; color: #666; }
  .stat .v { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ddd; padding: 2px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #555; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ot { font-weight: 700; }
  .strong { font-weight: 700; }
  .warn { color: #b45309; font-weight: 600; }
  tfoot td { font-weight: 700; border-top: 2px solid #999; background: #fafafa; }
  /* Employees follow one another (a card may continue on the next page) instead of each one jumping to a new
     page when it does not fit: only the name + table header, a job row and the money block stay together. */
  .emp { font-size: 9.5px; line-height: 1.2; border: 1px solid #bbb; border-radius: 8px; padding: 5px 8px; margin-top: 10px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .emp h2 { break-after: avoid; page-break-after: avoid; }
  .emp tr, .emp .cols, .emp .note { break-inside: avoid; page-break-inside: avoid; }
  .cols { display: grid; grid-template-columns: 1.2fr 1.3fr 1fr; gap: 8px; margin-top: 4px; align-items: start; }
  .emp th, .emp td { padding-top: 1px; padding-bottom: 1px; }
  .emp h2 { font-size: 12px; margin-bottom: 3px; }
  .kv th, .kv td { padding: 1px 6px; }
  .kv td:first-child { color: #333; }
  .kv tr.sub td { border-top: 1px solid #999; }
  .kv tr.total td { font-weight: 700; border-top: 2px solid #999; background: #f3f4f6; }
  .note { color: #555; font-style: italic; margin: 6px 0 0; }
  .foot { margin-top: 12px; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 6px; line-height: 1.5; }
  .detail-title { margin-top: 18px; break-after: avoid; page-break-after: avoid; }
  .summary td:first-child { white-space: nowrap; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } }
`;

export function buildWeeklyReportHtml(report, { generatedAt = new Date() } = {}) {
  const { week, employees, totals, reviewReasons } = report;
  const title = `Sommaire de la semaine ${week.weekNo ?? ""} — ${week.start} au ${week.end}`;
  const stat = (label, value) => `<div class="stat"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div></div>`;

  const summaryRows = employees.map((e) => `
    <tr>
      <td>${esc(e.name)}${e.pendingJobs ? ' <span class="warn">*</span>' : ""}</td>
      <td class="num">${e.jobs.length}</td>
      <td class="num strong">${fmtHM(e.hours.paidMinutes)}</td>
      <td class="num">${fmtHM(e.hours.ccqMinutes)}</td>
      <td class="num">${fmtHM(e.hours.nonCcqMinutes)}</td>
      <td class="num">${fmtHM(e.hours.ot50Minutes + e.hours.ot100Minutes)}</td>
      <td class="num">${fmtKm(e.hours.km)}</td>
      <td class="num">${e.pay ? fmtMoney(e.pay.salary) : "—"}</td>
      <td class="num">${e.pay ? fmtMoney(e.pay.totalDeductions) : "—"}</td>
      <td class="num">${e.pay ? fmtMoney(e.pay.net) : "—"}</td>
      <td class="num">${e.pay ? fmtMoney(e.pay.das.arc) : "—"}</td>
      <td class="num">${e.pay ? fmtMoney(e.pay.das.quebec) : "—"}</td>
      <td class="num">${e.pay ? fmtMoney(e.pay.employer.total) : "—"}</td>
    </tr>`).join("");

  const warnings = [
    "Estimation : les règles de paie sont en brouillon (à réviser) — ce document n'est ni un talon officiel ni une déclaration de DAS.",
    totals.pendingJobs ? `${totals.pendingJobs} job(s) ne sont pas encore approuvées (*) : leurs montants peuvent changer.` : "",
    ...reviewReasons.map(reviewReasonFr).filter(Boolean).map((r) => `À réviser : ${r}`),
  ].filter(Boolean);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${REPORT_STYLES}</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="sub-title">${esc(EMPLOYER)} · semaine CCQ du dimanche au samedi · généré le ${esc(generatedAt.toLocaleString("fr-CA"))}</p>
  <div class="warn-box">${warnings.map(esc).join("<br>")}</div>

  <div class="stats">
    ${stat("Employés", totals.employees)}
    ${stat("Jobs", totals.jobs)}
    ${stat("Total heures", fmtHM(totals.paidMinutes))}
    ${stat("Heures CCQ", fmtHM(totals.ccqMinutes))}
    ${stat("Heures hors CCQ", fmtHM(totals.nonCcqMinutes))}
    ${stat("Temps sup. (1,5× + 2×)", fmtHM(totals.ot50Minutes + totals.ot100Minutes))}
    ${stat("Kilomètres", fmtKm(totals.km))}
    ${stat("Salaires bruts", fmtMoney(totals.salary))}
    ${stat("DAS — ARC", fmtMoney(totals.dasArc))}
    ${stat("DAS — Revenu Québec", fmtMoney(totals.dasQuebec))}
    ${stat("DAS total", fmtMoney(totals.dasTotal))}
    ${stat("Net versé", fmtMoney(totals.net))}
    ${stat("Coût employeur total", fmtMoney(totals.employerCost))}
  </div>

  <h3>Sommaire par employé</h3>
  <table class="summary">
    <thead><tr>
      <th>Employé</th><th class="num">Jobs</th><th class="num">Total heures</th><th class="num">Heures CCQ</th><th class="num">Hors CCQ</th><th class="num">Temps sup.</th><th class="num">km</th>
      <th class="num">Brut</th><th class="num">Retenues</th><th class="num">Net</th>
      <th class="num">DAS ARC</th><th class="num">DAS QC</th><th class="num">Coût employeur</th>
    </tr></thead>
    <tbody>${summaryRows}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td class="num">${totals.jobs}</td>
      <td class="num">${fmtHM(totals.paidMinutes)}</td>
      <td class="num">${fmtHM(totals.ccqMinutes)}</td>
      <td class="num">${fmtHM(totals.nonCcqMinutes)}</td>
      <td class="num">${fmtHM(totals.ot50Minutes + totals.ot100Minutes)}</td>
      <td class="num">${fmtKm(totals.km)}</td>
      <td class="num">${fmtMoney(totals.salary)}</td>
      <td class="num">${fmtMoney(totals.totalDeductions)}</td>
      <td class="num">${fmtMoney(totals.net)}</td>
      <td class="num">${fmtMoney(totals.dasArc)}</td>
      <td class="num">${fmtMoney(totals.dasQuebec)}</td>
      <td class="num">${fmtMoney(totals.employerCost)}</td>
    </tr></tfoot>
  </table>

  <h3 class="detail-title">Détail par employé</h3>
  ${employees.map(employeeHtml).join("")}

  <div class="foot">
    Sommaire : Total heures = Heures CCQ + Hors CCQ · Heures CCQ = régulier + 1,5× + 2× (comme le rapport CCQ ; le temps sup.
    en fait partie) · Hors CCQ = retour à l'entrepôt sans avantages, ou toutes les heures d'un rôle hors CCQ.
    Heures : Rég. = régulier (retour avec avantages inclus) · 1,5× / 2× = temps supplémentaire · Retour s.a. = temps de retour
    sans avantages · Total = temps payé. Les montants viennent du même calcul que les écrans Talons et DAS (taux du profil
    de l'employé, cumul de l'année comptabilisé). Coût employeur = salaire brut + 13 % CCQ + avantages sociaux CCQ + cotisations
    employeur (RRQ, AE, RQAP, FSS, CNT, CNESST, FDRCMO) + autres cotisations CCQ par heure (prélèvement, AECQ/ACQ, taxe
    d'assurance, fonds divers) + remboursements (km, souper, stationnement, cellulaire, entreposage, équipement de sécurité).
    Retenues CCQ = retraite, MÉDIC et sa taxe, cotisation syndicale, prélèvement CCQ, caisse d'éducation.
  </div>
</body></html>`;
}

// Writes the report into a window opened beforehand (synchronously in the click handler, so the
// popup is not blocked while the data loads) and opens the print dialog.
export function printWeeklyReport(win, report) {
  if (!win) return false;
  win.document.open();
  win.document.write(buildWeeklyReportHtml(report));
  win.document.close();
  // A written document does not always fire `load`: whichever comes first prints, once.
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    try { win.focus(); win.print(); } catch { /* window closed */ }
  };
  win.onload = print;
  setTimeout(print, 500);
  return true;
}
