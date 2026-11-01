import { QUEBEC_2026 } from "./2026.js";

// Yearly statutory scales entered by the owner (« Barèmes annuels », migration 0131). A set replaces the
// sections below for one tax year; everything else (pay frequencies, CNESST, version label) comes from the
// coded 2026 set. A set that fails validateRuleData() is never installed, so a typo cannot reach a pay stub.
export const RULE_SECTIONS = Object.freeze(["rrq", "ei", "rqap", "federalTax", "quebecTax", "fss", "labourStandards", "workforceFund"]);

const clone = (value) => JSON.parse(JSON.stringify(value));

// Plain-JSON copy of the editable sections (Infinity ↔ null, so it can be stored in jsonb).
export function serializeRules(rules = QUEBEC_2026) {
  const out = {};
  for (const key of RULE_SECTIONS) {
    out[key] = clone(rules[key]);
    delete out[key].unvalidated;
  }
  for (const key of ["federalTax", "quebecTax"]) {
    out[key].brackets = rules[key].brackets.map((b) => ({ upTo: Number.isFinite(b.upTo) ? b.upTo : null, rate: b.rate, K: b.K }));
  }
  return out;
}

export function reviveRules(data) {
  const out = clone(data);
  for (const key of ["federalTax", "quebecTax"]) {
    out[key].brackets = (out[key].brackets || []).map((b) => ({ ...b, upTo: b.upTo == null ? Infinity : b.upTo }));
  }
  return out;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// T4127 / TP-1015.F constant of bracket i from the brackets before it: K_i = K_{i-1} + (R_i − R_{i-1}) × A_{i-1}.
export function bracketConstants(brackets) {
  const out = [];
  let k = 0;
  brackets.forEach((b, i) => {
    if (i > 0) k += (b.rate - brackets[i - 1].rate) * brackets[i - 1].upTo;
    out.push(k);
  });
  return out;
}

// List of problems (French sentences); empty = coherent. `data` is the serialized form (Infinity as null).
export function validateRuleData(data) {
  const problems = [];
  if (!data || typeof data !== "object") return ["Barème absent ou illisible."];
  const num = (path, { min = 0, max = Infinity } = {}) => {
    const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
    if (!isNum(v) || v < min || v > max) { problems.push(`Valeur invalide : ${path}.`); return null; }
    return v;
  };
  const rate = (path) => num(path, { min: 0, max: 1 });

  const ympe = num("rrq.ympe"); const exemption = num("rrq.basicExemption");
  const t1 = { e: rate("rrq.tier1.employeeRate"), r: rate("rrq.tier1.employerRate"), b: rate("rrq.tier1.baseRate"), em: num("rrq.tier1.employeeMaximum"), rm: num("rrq.tier1.employerMaximum"), bm: num("rrq.tier1.baseMaximum") };
  const lo = num("rrq.tier2.lowerLimit"); const hi = num("rrq.tier2.upperLimit");
  const t2 = { e: rate("rrq.tier2.employeeRate"), r: rate("rrq.tier2.employerRate"), em: num("rrq.tier2.employeeMaximum"), rm: num("rrq.tier2.employerMaximum") };
  if (ympe != null && exemption != null && t1.e != null) {
    if (t1.em != null && !near(t1.em, (ympe - exemption) * t1.e, 0.06)) problems.push("RRQ : le maximum de cotisation ne correspond pas à (maximum des gains − exemption) × taux.");
    if (t1.rm != null && t1.r != null && !near(t1.rm, (ympe - exemption) * t1.r, 0.06)) problems.push("RRQ : le maximum patronal ne correspond pas au taux patronal.");
    if (t1.bm != null && t1.b != null && !near(t1.bm, (ympe - exemption) * t1.b, 0.06)) problems.push("RRQ : le maximum de base ne correspond pas au taux de base.");
  }
  if (lo != null && ympe != null && lo !== ympe) problems.push("RRQ : la limite inférieure de la 2e cotisation doit être égale au maximum des gains.");
  if (lo != null && hi != null) {
    if (hi <= lo) problems.push("RRQ : la limite supérieure de la 2e cotisation doit dépasser la limite inférieure.");
    else {
      if (t2.e != null && t2.em != null && !near(t2.em, (hi - lo) * t2.e, 0.06)) problems.push("RRQ : le maximum de la 2e cotisation ne correspond pas à l'écart × taux.");
      if (t2.r != null && t2.rm != null && !near(t2.rm, (hi - lo) * t2.r, 0.06)) problems.push("RRQ : le maximum patronal de la 2e cotisation ne correspond pas au taux.");
    }
  }
  for (const [name, label] of [["ei", "Assurance-emploi"], ["rqap", "RQAP"]]) {
    const mie = num(`${name}.maxInsurableEarnings`);
    const er = rate(`${name}.employeeRate`); const pr = rate(`${name}.employerRate`);
    const em = num(`${name}.employeeMaximum`); const pm = num(`${name}.employerMaximum`);
    if (mie != null && er != null && em != null && !near(em, mie * er, 0.06)) problems.push(`${label} : le maximum employé ne correspond pas à gains assurables × taux.`);
    if (mie != null && pr != null && pm != null && !near(pm, mie * pr, 0.06)) problems.push(`${label} : le maximum patronal ne correspond pas à gains assurables × taux.`);
  }

  for (const [name, label] of [["federalTax", "Impôt fédéral"], ["quebecTax", "Impôt du Québec"]]) {
    const section = data[name];
    const brackets = section?.brackets;
    if (!Array.isArray(brackets) || brackets.length < 2) { problems.push(`${label} : paliers manquants.`); continue; }
    let previous = 0; let previousRate = -1; let ok = true;
    brackets.forEach((b, i) => {
      const last = i === brackets.length - 1;
      if (!isNum(b?.rate) || b.rate < 0 || b.rate > 1 || !isNum(b?.K) || (!last && !isNum(b?.upTo)) || (last && b.upTo != null)) { ok = false; return; }
      if (!last && b.upTo <= previous) ok = false;
      if (b.rate <= previousRate) ok = false;
      previous = last ? previous : b.upTo; previousRate = b.rate;
    });
    if (!ok) { problems.push(`${label} : les paliers doivent croître (seuil et taux), le dernier sans plafond.`); continue; }
    const expected = bracketConstants(brackets.map((b, i) => ({ ...b, upTo: i === brackets.length - 1 ? 0 : b.upTo })));
    expected.forEach((k, i) => {
      if (!near(brackets[i].K, k, 1.01)) problems.push(`${label} : la constante K du palier ${i + 1} s'écarte du calcul (${Math.round(k)}).`);
    });
    if (brackets[0].K !== 0) problems.push(`${label} : la constante K du 1er palier doit être 0.`);
    if (isNum(section.lowestRate) && !near(section.lowestRate, brackets[0].rate, 1e-9)) problems.push(`${label} : le taux des crédits doit égaler le taux du 1er palier.`);
    num(`${name}.basicPersonalAmount`);
  }
  num("federalTax.canadaEmploymentAmount"); rate("federalTax.quebecAbatement"); num("quebecTax.workerDeduction");

  for (const group of ["general", "primary_manufacturing"]) {
    const low = num(`fss.${group}.lowPayrollThreshold`); const high = num(`fss.${group}.highPayrollThreshold`);
    if (low != null && high != null && high <= low) problems.push("FSS : le seuil haut doit dépasser le seuil bas.");
    rate(`fss.${group}.lowRate`); rate(`fss.${group}.highRate`); num(`fss.${group}.slideBase`, { max: 100 }); num(`fss.${group}.slideFactor`, { max: 100 });
  }
  rate("fss.public.flatRate");
  rate("labourStandards.rate"); num("labourStandards.maxAssessablePerEmployee");
  num("workforceFund.payrollThreshold"); rate("workforceFund.rate");
  return problems;
}

// ── Installed sets ───────────────────────────────────────────────────────────────────────────
const installed = new Map(); // year → rule set (QC)

function buildRuleSet(year, data) {
  const revived = reviveRules(data);
  return {
    ...QUEBEC_2026,
    ...Object.fromEntries(RULE_SECTIONS.map((key) => [key, { ...QUEBEC_2026[key], ...revived[key], unvalidated: false }])),
    year,
    version: { ...QUEBEC_2026.version, taxYear: year, quebec: `RQ-OWNER-${year}`, federal: `CRA-OWNER-${year}`, status: "draft" },
  };
}

// Installs the owner's sets (rows { tax_year, data }); returns the years rejected with their problems.
export function setRuleSetOverrides(rows = []) {
  installed.clear();
  const rejected = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const year = Number(row?.tax_year ?? row?.taxYear);
    if (!Number.isInteger(year)) continue;
    const problems = validateRuleData(row?.data);
    if (problems.length) { rejected.push({ year, problems }); continue; }
    installed.set(year, buildRuleSet(year, row.data));
  }
  return rejected;
}

export const getRuleSetOverride = (year) => installed.get(Number(year)) || null;
export const installedRuleYears = () => [...installed.keys()].sort((a, b) => a - b);

// Years that have a rule set: the coded one(s) plus the installed ones.
export function availableRuleYears() {
  return [...new Set([QUEBEC_2026.year, ...installed.keys()])].sort((a, b) => a - b);
}

// The tax year a pay week uses. A week is taxed in the year it is paid (week end + 5 days, the convention of
// the weekly report). When that year has no set yet, the latest earlier one is used and `assumedFrom` says so,
// so a missing scale never blocks a pay screen but is never silent either.
export function resolveTaxYear(year) {
  const wanted = Number(year);
  const years = availableRuleYears();
  if (years.includes(wanted)) return { taxYear: wanted, assumedFrom: null };
  const earlier = years.filter((y) => y <= wanted);
  return { taxYear: earlier.length ? earlier[earlier.length - 1] : years[0], assumedFrom: wanted };
}

// Year in which the pay week starting `weekStart` (YYYY-MM-DD) is paid; no date = today.
export function payYearForWeek(weekStart) {
  const base = weekStart ? Date.parse(`${String(weekStart).slice(0, 10)}T00:00:00Z`) : Date.now();
  return new Date(base + (weekStart ? 11 : 0) * 86400000).getUTCFullYear();
}
