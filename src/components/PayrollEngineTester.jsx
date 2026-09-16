import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { AlertTriangle, Calculator, ChevronDown, Printer, Save } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculatePayroll, RULE_VERSION, computeCcqBenefits, CCQ_ELECTRICIAN_IC_C3, CCQ_LEVELS, CCQ_UNIONS, CCQ_UNION_KEYS, PAY_PERIODS_PER_YEAR } from "@/payroll";
import { calculatePayrollEntries } from "@/lib/payroll-calculations";
import { ccqWeekNumber } from "@/lib/ccq-week";
import PayStubPrint from "@/components/PayStubPrint";
import { useT } from "@/lib/use-t";

const TAX_YEAR = 2026;

// CCQ week (Sunday → Saturday) keyed by the ending Saturday.
function ccqWeek(dateStr) {
  const d = dayjs(dateStr);
  const end = d.add((6 - d.day() + 7) % 7, "day");
  return { key: end.format("YYYY-MM-DD"), start: end.subtract(6, "day"), end };
}

// CCQ cumulative (Sommaire) figures — record-only opening balances from the stub.
// [stateKey, dbColumn, label]. They do NOT feed the DAS calc; they're stored so the
// app holds a complete YTD picture per employee.
const CCQ_CUMUL = [
  ["vacancesCcq", "vacances_ccq", "Vacances CCQ (13%)"],
  ["regularEarnings", "regular_earnings", "Salaire régulier"],
  ["doubleTime", "double_time", "Temps double"],
  ["vacationPay", "vacation_pay", "Vacances"],
  ["ccqLevy", "ccq_levy", "Prélèvement CCQ"],
  ["ccqBenefitsDeduction", "ccq_benefits_deduction", "Av. sociaux CCQ (déd.)"],
  ["ccqBenefitsAdvantage", "ccq_benefits_advantage", "Av. sociaux CCQ (avantage)"],
  ["ccqTaxableBenefit", "ccq_taxable_benefit", "Avantage imposable add. CCQ"],
  ["medicInsurance", "medic_insurance", "Assurance MÉDIC"],
  ["unionDues", "union_dues", "Cotisation syndicale"],
  ["unionEducationFund", "union_education_fund", "Caisse d'éducation syndicale"],
  ["insuranceSalesTax", "insurance_sales_tax", "Taxe de vente assurance"],
  ["safetyEquipment", "safety_equipment", "Équipement de sécurité"],
  ["kmIndemnity", "km_indemnity", "Indemnité KM"],
  ["otherIncome", "other_income", "Autre revenu"],
  ["hoursYtd", "hours_ytd", "Heures"],
];

const EMPTY_YTD = {
  grossIncome: 0, rrqEmployee: 0, rrq2Employee: 0, eiEmployee: 0, rqapEmployee: 0, federalTax: 0, quebecTax: 0, pensionableIncomeRRQ: 0, insurableIncomeEI: 0, insurableIncomeRQAP: 0, labourStandardsIncome: 0,
  ...Object.fromEntries(CCQ_CUMUL.map(([k]) => [k, 0])),
};

const money = (n) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
const toCents = (d) => Math.round((Number(d) || 0) * 100);

// ── Small controlled inputs ──────────────────────────────────────────────────
function Field({ label, value, onChange, type = "number", step = "0.01", suffix }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function Section({ title, children }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
      </CardContent>
    </Card>
  );
}

// tone: "add" = a gain/addition (green), "ded" = a deduction (red), undefined = neutral.
function Row({ label, value, strong, tone }) {
  const toneClass = tone === "add" ? "text-green-600 dark:text-green-400" : tone === "ded" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div className={`flex items-baseline justify-between gap-2 ${strong ? "border-t pt-2 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`font-mono ${toneClass}`}>{value}</span>
    </div>
  );
}

// The Testing → Payroll bench. It contains NO tax logic — it only gathers input,
// calls calculatePayroll(input), and renders the result (spec steps 21-23 + the
// golden rule). Everything shown is a test-bench estimate, never finalized pay.
export default function PayrollEngineTester() {
  const t = useT();
  const [frequency, setFrequency] = useState("weekly");
  const [pay, setPay] = useState({ regularHours: 40, baseRate: 45.36, premium: 0, ot150Hours: 0, ot200Hours: 0, km: 0, kmRate: 0, taxableBenefit: 0 });
  const [emp, setEmp] = useState({ td1ClaimAmount: "", personalTaxCredits: "", additionalFederal: 0, additionalQuebec: 0 });
  const [ytd, setYtd] = useState({ ...EMPTY_YTD });
  const [asOfDate, setAsOfDate] = useState("");
  const [employer, setEmployer] = useState({ annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 2.0, workforceSkillsFundApplicable: false });
  const [result, setResult] = useState(null);
  const [reimb, setReimb] = useState({ km: 0, phone: 0, total: 0 });
  // CCQ benefit modelling (folded into the DAS bases via baseAdjustments). Rates
  // seed from the sourced électricien-C3 config but stay editable per métier. The
  // pension rate follows the level (compagnon 9 % / apprenti 4,5 %); the deductible
  // pension amount is computed from the wage (never hardcoded).
  const [ccq, setCcq] = useState({
    enabled: true,
    status: "journeyman",
    union: "ftq_fipoe",
    vacationRatePct: CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate * 100,
    imposablePerHour: CCQ_ELECTRICIAN_IC_C3.taxableBenefitPerHour,
    medicPerHour: CCQ_ELECTRICIAN_IC_C3.medicEmployeePerHour,
    medicTaxPct: CCQ_ELECTRICIAN_IC_C3.medicProvincialTaxRate * 100,
    prelevementCcq: 0,        // CCQ remittance withholding (federal U1 deduction)
    caisseEducation: 0,       // union education fund (federal U1 deduction)
  });
  const [ccqAmounts, setCcqAmounts] = useState(null);
  const [openExplain, setOpenExplain] = useState(false);
  const [showStub, setShowStub] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [weekOptions, setWeekOptions] = useState([]); // [{key, label, start, end, weekNo, regularHours, ot150Hours, ot200Hours, km}]
  const [selectedWeek, setSelectedWeek] = useState(""); // "" = manual
  const [saveState, setSaveState] = useState({ status: "idle", message: "" }); // idle|loading|saving|saved|error

  // Load the roster once. Errors are non-fatal — the bench still works manually.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, hourly_rate, km_rate, team_leader_premium, apprentice_level, employee_number, ccq_number, phone_data_reimbursement")
        .order("full_name", { ascending: true });
      if (!cancelled) setEmployees(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // On employee change: prefill the hourly rate and load any saved YTD balances.
  async function handleSelectEmployee(id) {
    setSelectedId(id);
    setSaveState({ status: "idle", message: "" });
    setWeekOptions([]); setSelectedWeek("");
    if (!id) return;
    const profile = employees.find((e) => e.id === id);
    if (profile?.hourly_rate != null) {
      // Base wage + team-leader premium kept separate: regular is paid at base +
      // premium, but overtime is computed on the BASE rate only (per the CCQ stub).
      setPay((s) => ({
        ...s,
        baseRate: Number(profile.hourly_rate) || 0,
        premium: Number(profile.team_leader_premium) || 0,
        kmRate: Number(profile.km_rate) || 0,
      }));
    }
    // CCQ level → pension rate: an apprentice_level (1-4) maps to apprenticeN;
    // anything else is treated as compagnon (journeyman).
    const lvl = Number(profile?.apprentice_level);
    setCcq((s) => ({ ...s, status: lvl >= 1 && lvl <= 4 ? `apprentice${lvl}` : "journeyman" }));

    // Build a week picker from the employee's recent jobs (last ~16 weeks).
    const since = dayjs().subtract(16, "week").format("YYYY-MM-DD");
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes")
      .eq("user_id", id).gte("job_date", since).order("job_date", { ascending: false });
    const byWeek = new Map();
    (jobRows || []).forEach((j) => {
      const w = ccqWeek(j.job_date);
      if (!byWeek.has(w.key)) byWeek.set(w.key, { ...w, jobs: [] });
      byWeek.get(w.key).jobs.push(j);
    });
    const opts = [...byWeek.values()].map((w) => {
      let regMin = 0, ot50 = 0, ot100 = 0, retMin = 0, km = 0;
      calculatePayrollEntries(w.jobs).forEach((e) => {
        regMin += e.regularWorkMinutes; ot50 += e.overtime50Minutes; ot100 += e.overtime100Minutes;
        retMin += e.returnRegularMinutes; km += e.totalKm;
      });
      return {
        key: w.key, start: w.start, end: w.end, weekNo: ccqWeekNumber(w.end),
        regularHours: (regMin + retMin) / 60, ot150Hours: ot50 / 60, ot200Hours: ot100 / 60, km,
      };
    }).sort((a, b) => (a.key < b.key ? 1 : -1));
    setWeekOptions(opts);

    setSaveState({ status: "loading", message: "" });
    const { data, error } = await supabase
      .from("payroll_ytd")
      .select("*")
      .eq("user_id", id)
      .eq("tax_year", TAX_YEAR)
      .maybeSingle();
    if (error) { setSaveState({ status: "error", message: error.message }); setYtd({ ...EMPTY_YTD }); setAsOfDate(""); return; }
    if (data) {
      setYtd({
        grossIncome: data.gross_income, rrqEmployee: data.rrq_employee, rrq2Employee: data.rrq2_employee,
        eiEmployee: data.ei_employee, rqapEmployee: data.rqap_employee, federalTax: data.federal_tax,
        quebecTax: data.quebec_tax, pensionableIncomeRRQ: data.pensionable_income_rrq,
        insurableIncomeEI: data.insurable_income_ei, insurableIncomeRQAP: data.insurable_income_rqap,
        labourStandardsIncome: data.labour_standards_income,
        ...Object.fromEntries(CCQ_CUMUL.map(([k, col]) => [k, data[col] ?? 0])),
      });
      setAsOfDate(data.as_of_date || "");
      setSaveState({ status: "saved", message: t("payroll.loaded") });
    } else {
      setYtd({ ...EMPTY_YTD }); setAsOfDate("");
      setSaveState({ status: "idle", message: t("payroll.noSaved") });
    }
  }

  async function handleSaveYtd() {
    if (!selectedId) return;
    setSaveState({ status: "saving", message: "" });
    const num = (v) => Number(v) || 0;
    const { error } = await supabase.from("payroll_ytd").upsert({
      user_id: selectedId, tax_year: TAX_YEAR, as_of_date: asOfDate || null,
      gross_income: num(ytd.grossIncome), rrq_employee: num(ytd.rrqEmployee), rrq2_employee: num(ytd.rrq2Employee),
      ei_employee: num(ytd.eiEmployee), rqap_employee: num(ytd.rqapEmployee), federal_tax: num(ytd.federalTax),
      quebec_tax: num(ytd.quebecTax), pensionable_income_rrq: num(ytd.pensionableIncomeRRQ),
      insurable_income_ei: num(ytd.insurableIncomeEI), insurable_income_rqap: num(ytd.insurableIncomeRQAP),
      labour_standards_income: num(ytd.labourStandardsIncome),
      ...Object.fromEntries(CCQ_CUMUL.map(([k, col]) => [col, num(ytd[k])])),
    }, { onConflict: "user_id,tax_year" });
    setSaveState(error ? { status: "error", message: error.message } : { status: "saved", message: t("payroll.saved") });
  }

  // Selecting a week fills the hours + km from that week's actual jobs; "" = manual.
  function handleSelectWeek(key) {
    setSelectedWeek(key);
    if (!key) return;
    const w = weekOptions.find((o) => o.key === key);
    if (!w) return;
    const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
    setFrequency("weekly");
    setPay((s) => ({ ...s, regularHours: r2(w.regularHours), ot150Hours: r2(w.ot150Hours), ot200Hours: r2(w.ot200Hours), km: r2(w.km) }));
  }

  const setP = (k) => (v) => setPay((s) => ({ ...s, [k]: v }));
  const setE = (k) => (v) => setEmp((s) => ({ ...s, [k]: v }));
  const setY = (k) => (v) => setYtd((s) => ({ ...s, [k]: v }));
  const setEr = (k) => (v) => setEmployer((s) => ({ ...s, [k]: v }));
  const setC = (k) => (v) => setCcq((s) => ({ ...s, [k]: v }));

  function handleCalculate() {
    const earnings = [];
    const base = Number(pay.baseRate);
    const prem = Number(pay.premium);
    // Regular is paid at base + premium; overtime is on the base rate only (CCQ).
    const regular = Number(pay.regularHours) * (base + prem);
    const overtime = Number(pay.ot150Hours) * base * 1.5 + Number(pay.ot200Hours) * base * 2;
    if (regular) earnings.push({ type: "regular", amount: regular });
    if (overtime) earnings.push({ type: "overtime", amount: overtime });
    if (Number(pay.taxableBenefit)) earnings.push({ type: "taxableBenefit", amount: Number(pay.taxableBenefit) });

    // Non-taxable reimbursements/allowances (outside the DAS calc): KM + weekly
    // phone/data + CCQ safety-equipment allowance (added once CCQ is computed).
    const profile = employees.find((e) => e.id === selectedId);
    const kmReimb = Number(pay.km) * Number(pay.kmRate);
    const phoneReimb = Number(profile?.phone_data_reimbursement) || 0;

    // CCQ benefits (upstream of the tax engine): fold the collective-agreement
    // indemnity / taxable benefit / social-benefits deduction into the DAS bases.
    const totalHours = Number(pay.regularHours) + Number(pay.ot150Hours) + Number(pay.ot200Hours);
    let baseAdjustments;
    let unionDuesFederalAnnual = 0; // U1 federal deduction, annualized
    let safetyEquip = 0;
    if (ccq.enabled) {
      const pensionRate = CCQ_ELECTRICIAN_IC_C3.levels[ccq.status]?.employeePensionRate
        ?? CCQ_ELECTRICIAN_IC_C3.levels.journeyman.employeePensionRate;
      const benefits = computeCcqBenefits({
        hours: totalHours,
        hourlyWage: base,
        employeePensionRate: pensionRate,
        taxableBenefitPerHour: Number(ccq.imposablePerHour) || 0,
        vacationHolidaySickRate: (Number(ccq.vacationRatePct) || 0) / 100,
        medicEmployeePerHour: Number(ccq.medicPerHour) || 0,
        medicProvincialTaxRate: (Number(ccq.medicTaxPct) || 0) / 100,
        union: ccq.union,
        level: ccq.status,
        prelevementCcq: Number(ccq.prelevementCcq) || 0,
        caisseEducationSyndicale: Number(ccq.caisseEducation) || 0,
      });
      baseAdjustments = benefits.baseAdjustments;
      // Union dues + prélèvement + caisse are federal-only deductions (U1), computed
      // per week and annualized. Québec treats them as credits, so they never touch QC.
      unionDuesFederalAnnual = (benefits.federalDeduction || 0) * (PAY_PERIODS_PER_YEAR[frequency] || 52);
      safetyEquip = benefits.safetyEquipment || 0;
      setCcqAmounts(benefits);
    } else {
      setCcqAmounts(null);
    }
    setReimb({ km: kmReimb, phone: phoneReimb, safety: safetyEquip, total: kmReimb + phoneReimb + safetyEquip });

    setResult(calculatePayroll({
      taxYear: 2026,
      provinceOfEmployment: "QC",
      payPeriod: { frequency },
      employee: {
        federalTaxProfile: {
          td1ClaimAmount: emp.td1ClaimAmount === "" ? undefined : Number(emp.td1ClaimAmount),
          additionalTax: Number(emp.additionalFederal) || 0,
          // Union dues reduce the FEDERAL base only (T4127 U1), auto-computed above.
          // Québec treats them as a credit, not a base deduction — so no Québec entry.
          annualDeductions: unionDuesFederalAnnual,
        },
        quebecTaxProfile: {
          personalTaxCredits: emp.personalTaxCredits === "" ? undefined : Number(emp.personalTaxCredits),
          additionalTax: Number(emp.additionalQuebec) || 0,
        },
      },
      employer: {
        annualPayrollEstimate: Number(employer.annualPayrollEstimate) || 0,
        fssCategory: employer.fssCategory,
        cnesstRate: employer.cnesstRate === "" ? undefined : Number(employer.cnesstRate) / 100,
        workforceSkillsFundApplicable: employer.workforceSkillsFundApplicable,
      },
      earnings,
      baseAdjustments,
      ytd: {
        grossIncome: toCents(ytd.grossIncome),
        rrqEmployee: toCents(ytd.rrqEmployee),
        rrqEmployer: toCents(ytd.rrqEmployee),
        rrq2Employee: toCents(ytd.rrq2Employee),
        rrq2Employer: toCents(ytd.rrq2Employee),
        eiEmployee: toCents(ytd.eiEmployee),
        eiEmployer: toCents(ytd.eiEmployee),
        rqapEmployee: toCents(ytd.rqapEmployee),
        rqapEmployer: toCents(ytd.rqapEmployee),
        federalTax: toCents(ytd.federalTax),
        quebecTax: toCents(ytd.quebecTax),
        pensionableIncomeRRQ: toCents(ytd.pensionableIncomeRRQ),
        insurableIncomeEI: toCents(ytd.insurableIncomeEI),
        insurableIncomeRQAP: toCents(ytd.insurableIncomeRQAP),
        labourStandardsIncome: toCents(ytd.labourStandardsIncome),
      },
    }));
    setOpenExplain(false);
  }

  return (
    <div className="space-y-3">
      {/* ── Boundary banner (ADR 0001 / payroll-rule gate) ── */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>{t("payroll.banner.title")}</b> {t("payroll.banner.body", { quebec: RULE_VERSION.quebec, federal: RULE_VERSION.federal })}
          </div>
        </div>
      </div>

      {/* ── Inputs ── */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.employee")}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("payroll.province")}</span>
              <input value="Québec" disabled className="mt-1 w-full rounded-md border bg-muted/40 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("payroll.frequency")}</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="weekly">{t("payroll.freq.weekly")}</option>
                <option value="biweekly">{t("payroll.freq.biweekly")}</option>
                <option value="semimonthly">{t("payroll.freq.semimonthly")}</option>
                <option value="monthly">{t("payroll.freq.monthly")}</option>
              </select>
            </label>
            <Field label={t("payroll.td1")} value={emp.td1ClaimAmount} onChange={setE("td1ClaimAmount")} step="1" />
            <Field label={t("payroll.qcCredits")} value={emp.personalTaxCredits} onChange={setE("personalTaxCredits")} step="1" />
            <Field label={t("payroll.extraFederal")} value={emp.additionalFederal} onChange={setE("additionalFederal")} />
            <Field label={t("payroll.extraQuebec")} value={emp.additionalQuebec} onChange={setE("additionalQuebec")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.paySection")}</div>
          {selectedId && (
            <label className="mb-3 block text-xs">
              <span className="text-muted-foreground">{t("payroll.weekSelect")}</span>
              <select value={selectedWeek} onChange={(e) => handleSelectWeek(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="">{t("payroll.weekManual")}</option>
                {weekOptions.map((w) => (
                  <option key={w.key} value={w.key}>
                    {t("manager.weekShort")} {w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM")} · {(w.regularHours + w.ot150Hours + w.ot200Hours).toFixed(2)}h · {w.km.toFixed(0)}km
                  </option>
                ))}
                {weekOptions.length === 0 && <option value="" disabled>{t("payroll.weekNone")}</option>}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={t("payroll.regularHours")} value={pay.regularHours} onChange={setP("regularHours")} step="0.25" />
            <Field label={t("payroll.baseRate")} value={pay.baseRate} onChange={setP("baseRate")} />
            <Field label={t("payroll.premium")} value={pay.premium} onChange={setP("premium")} />
            <Field label={t("payroll.ot150Hours")} value={pay.ot150Hours} onChange={setP("ot150Hours")} step="0.25" />
            <Field label={t("payroll.ot200Hours")} value={pay.ot200Hours} onChange={setP("ot200Hours")} step="0.25" />
            <Field label={t("payroll.km")} value={pay.km} onChange={setP("km")} step="1" />
            <Field label={t("payroll.kmRate")} value={pay.kmRate} onChange={setP("kmRate")} step="0.01" />
            <Field label={t("payroll.taxableBenefits")} value={pay.taxableBenefit} onChange={setP("taxableBenefit")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <input type="checkbox" checked={ccq.enabled} onChange={(e) => setC("enabled")(e.target.checked)} />
            <span>{t("payroll.ccqEnabled")}</span>
          </label>
          {ccq.enabled && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="block text-xs">
                  <span className="text-muted-foreground">{t("payroll.ccqStatus")}</span>
                  <select value={ccq.status} onChange={(e) => setC("status")(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                    {CCQ_LEVELS.map((k) => (
                      <option key={k} value={k}>
                        {CCQ_ELECTRICIAN_IC_C3.levels[k].label} · {(CCQ_ELECTRICIAN_IC_C3.levels[k].employeePensionRate * 100).toFixed(1)}%
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="text-muted-foreground">{t("payroll.ccqUnion")}</span>
                  <select value={ccq.union} onChange={(e) => setC("union")(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                    {CCQ_UNION_KEYS.map((k) => (
                      <option key={k} value={k}>{CCQ_UNIONS[k].label}</option>
                    ))}
                  </select>
                </label>
                <Field label={t("payroll.ccqVacationRate")} value={ccq.vacationRatePct} onChange={setC("vacationRatePct")} suffix="%" />
                <Field label={t("payroll.ccqImposable")} value={ccq.imposablePerHour} onChange={setC("imposablePerHour")} step="0.001" />
                <Field label={t("payroll.ccqMedic")} value={ccq.medicPerHour} onChange={setC("medicPerHour")} step="0.01" />
                <Field label={t("payroll.ccqMedicTax")} value={ccq.medicTaxPct} onChange={setC("medicTaxPct")} suffix="%" />
                <Field label={t("payroll.ccqPrelevement")} value={ccq.prelevementCcq} onChange={setC("prelevementCcq")} step="0.01" />
                <Field label={t("payroll.ccqCaisse")} value={ccq.caisseEducation} onChange={setC("caisseEducation")} step="0.01" />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t("payroll.ccqNote")}</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("payroll.ytdTitle", { year: TAX_YEAR })}
            </div>
            {selectedId && (
              <Button size="sm" variant="outline" onClick={handleSaveYtd} disabled={saveState.status === "saving"} className="text-xs">
                <Save className="mr-1.5 h-3.5 w-3.5" /> {saveState.status === "saving" ? t("payroll.saving") : t("payroll.save")}
              </Button>
            )}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("payroll.employee")}</span>
              <select value={selectedId} onChange={(e) => handleSelectEmployee(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="">{t("payroll.manual")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}{e.role && e.role !== "employee" ? ` · ${e.role}` : ""}</option>)}
              </select>
            </label>
            <Field label={t("payroll.asOf")} value={asOfDate} onChange={setAsOfDate} type="date" step={undefined} />
          </div>

          {saveState.message && (
            <div className={`mb-3 text-xs ${saveState.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {saveState.status === "error" ? t("payroll.saveUnavailable", { message: saveState.message }) : saveState.message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={t("payroll.grossYtd")} value={ytd.grossIncome} onChange={setY("grossIncome")} />
            <Field label={t("payroll.rrqYtd")} value={ytd.rrqEmployee} onChange={setY("rrqEmployee")} />
            <Field label={t("payroll.rrq2Ytd")} value={ytd.rrq2Employee} onChange={setY("rrq2Employee")} />
            <Field label={t("payroll.eiYtd")} value={ytd.eiEmployee} onChange={setY("eiEmployee")} />
            <Field label={t("payroll.rqapYtd")} value={ytd.rqapEmployee} onChange={setY("rqapEmployee")} />
            <Field label={t("payroll.federalTaxYtd")} value={ytd.federalTax} onChange={setY("federalTax")} />
            <Field label={t("payroll.quebecTaxYtd")} value={ytd.quebecTax} onChange={setY("quebecTax")} />
            <Field label={t("payroll.pensionableYtd")} value={ytd.pensionableIncomeRRQ} onChange={setY("pensionableIncomeRRQ")} />
            <Field label={t("payroll.insurableEiYtd")} value={ytd.insurableIncomeEI} onChange={setY("insurableIncomeEI")} />
            <Field label={t("payroll.insurableRqapYtd")} value={ytd.insurableIncomeRQAP} onChange={setY("insurableIncomeRQAP")} />
          </div>

          <details className="mt-3 group rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
              <span>{t("payroll.ccqCumulTitle")}</span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CCQ_CUMUL.map(([k, , label]) => (
                  <Field key={k} label={label} value={ytd[k]} onChange={setY(k)} />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t("payroll.ccqCumulNote")}</p>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.employer")}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={t("payroll.annualPayroll")} value={employer.annualPayrollEstimate} onChange={setEr("annualPayrollEstimate")} step="1000" />
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("payroll.fssCategory")}</span>
              <select value={employer.fssCategory} onChange={(e) => setEr("fssCategory")(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="general">{t("payroll.fss.general")}</option>
                <option value="primary_manufacturing">{t("payroll.fss.primary")}</option>
                <option value="public">{t("payroll.fss.public")}</option>
              </select>
            </label>
            <Field label={t("payroll.cnesstRate")} value={employer.cnesstRate} onChange={setEr("cnesstRate")} />
            <label className="col-span-2 flex items-center gap-2 self-end text-xs sm:col-span-3">
              <input type="checkbox" checked={employer.workforceSkillsFundApplicable} onChange={(e) => setEr("workforceSkillsFundApplicable")(e.target.checked)} />
              <span className="text-muted-foreground">{t("payroll.fdrcmo")}</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCalculate} className="w-full sm:w-auto">
          <Calculator className="mr-2 h-4 w-4" /> {t("payroll.calculate")}
        </Button>
        {result && result.gross && (
          <Button variant="outline" onClick={() => setShowStub(true)} className="w-full sm:w-auto">
            <Printer className="mr-2 h-4 w-4" /> {t("payroll.printStub")}
          </Button>
        )}
      </div>

      {result && <Results result={result} reimb={reimb} ccq={ccqAmounts} open={openExplain} setOpen={setOpenExplain} t={t} />}

      <PayStubPrint
        open={showStub}
        onOpenChange={setShowStub}
        result={result}
        ytd={ytd}
        pay={pay}
        reimb={reimb}
        ccq={ccqAmounts}
        employee={employees.find((e) => e.id === selectedId) || null}
        frequency={frequency}
        week={weekOptions.find((w) => w.key === selectedWeek) || null}
      />
    </div>
  );
}

function Results({ result, reimb, ccq, open, setOpen, t }) {
  if (!result.gross) {
    return (
      <Card>
        <CardContent className="p-4 text-sm">
          <div className="font-semibold text-amber-700 dark:text-amber-300">{t("payroll.requiresReview")}</div>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{result.reviewReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </CardContent>
      </Card>
    );
  }
  const { gross, employee, employer, das } = result;
  return (
    <div className="space-y-3">
      {result.requiresReview && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <b>{result.label}.</b> {result.reviewReasons.join(" ")}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.employee")}</div>
          {(() => {
            const statutory = employee.federalTax + employee.quebecTax + employee.rrq.total + employee.ei + employee.rqap;
            // Gross-up presentation (matches the CCQ stub): non-cash benefits are shown
            // as gains, then reversed in the deductions; safety equipment is a paid,
            // non-taxable allowance. Net = grossUp − (reversals + all withholdings).
            const reversals = ccq ? ccq.vacation + ccq.taxableBenefit + ccq.employerSocialBenefit : 0;
            const grossUp = gross.total + (ccq ? reversals + ccq.safetyEquipment : 0);
            const withheld = statutory + (ccq ? ccq.netWithholdings : 0);
            const totalRetenues = reversals + withheld;
            const net = grossUp - totalRetenues; // includes the paid safety allowance
            const extraReimb = reimb ? (reimb.km || 0) + (reimb.phone || 0) : 0;
            return (
              <>
                <Row label={t("payroll.grossTotal")} value={money(grossUp)} strong />
                {ccq && (
                  <>
                    <Row label={t("payroll.ccqVacation")} value={money(ccq.vacation)} tone="add" />
                    <Row label={t("payroll.ccqImposableRow")} value={money(ccq.taxableBenefit)} tone="add" />
                    <Row label={t("payroll.ccqEmployerSocial")} value={money(ccq.employerSocialBenefit)} tone="add" />
                    <Row label={t("payroll.ccqSafety")} value={money(ccq.safetyEquipment)} tone="add" />
                  </>
                )}
                <Row label={t("payroll.federalTax")} value={money(employee.federalTax)} tone="ded" />
                <Row label={t("payroll.quebecTax")} value={money(employee.quebecTax)} tone="ded" />
                <Row label="RRQ" value={money(employee.rrq.total)} tone="ded" />
                <Row label={t("payroll.ei")} value={money(employee.ei)} tone="ded" />
                <Row label="RQAP" value={money(employee.rqap)} tone="ded" />
                {ccq && (
                  <>
                    <Row label={t("payroll.ccqPensionRow")} value={money(ccq.pensionDeduction)} tone="ded" />
                    <Row label={t("payroll.ccqMedicRow")} value={money(ccq.medicWithholding)} tone="ded" />
                    <Row label={t("payroll.ccqUnionRow")} value={money(ccq.unionDues)} tone="ded" />
                    <Row label={t("payroll.ccqPrelevementRow")} value={money(ccq.prelevementCcq)} tone="ded" />
                    <Row label={t("payroll.ccqCaisseRow")} value={money(ccq.caisseEducationSyndicale)} tone="ded" />
                  </>
                )}
                <Row label={t("payroll.totalDeductions")} value={money(totalRetenues)} tone="ded" />
                <Row label={t("payroll.netPay")} value={money(net)} strong />
                {extraReimb > 0 && (
                  <>
                    {reimb.km > 0 && <Row label={t("payroll.reimbKm")} value={money(reimb.km)} tone="add" />}
                    {reimb.phone > 0 && <Row label={t("payroll.reimbPhone")} value={money(reimb.phone)} tone="add" />}
                    <Row label={t("payroll.netPlusReimb")} value={money(net + extraReimb)} strong />
                  </>
                )}
              </>
            );
          })()}
        </CardContent></Card>

        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.employer")}</div>
          <Row label="RRQ" value={money(employer.rrq)} />
          <Row label={t("payroll.ei")} value={money(employer.ei)} />
          <Row label="RQAP" value={money(employer.rqap)} />
          <Row label="FSS" value={money(employer.fss)} />
          <Row label={t("payroll.labourStandards")} value={money(employer.labourStandards)} />
          <Row label="FDRCMO" value={money(employer.workforceFund)} />
          <Row label="CNESST" value={money(employer.cnesst)} />
          <Row label={t("payroll.totalContributions")} value={money(employer.totalContributions)} />
          <Row label={t("payroll.totalPayrollCost")} value={money(employer.totalPayrollCost)} strong />
        </CardContent></Card>

        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.dasTitle")}</div>
          <Row label="Revenu Québec" value={money(das.quebec)} />
          <Row label={t("payroll.arcFederal")} value={money(das.arc)} />
          <Row label={t("payroll.totalDas")} value={money(das.total)} strong />
          <div className="pt-2 text-[11px] text-muted-foreground">
            {t("payroll.dasFooter")}
          </div>
        </CardContent></Card>
      </div>

      {/* Per-line calculation explanations (spec step 20) */}
      <Card>
        <CardContent className="p-0">
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
            <span>{t("payroll.calcDetails")}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <pre className="max-h-96 overflow-auto border-t bg-muted/30 p-4 text-xs">
              {JSON.stringify(result.explanation, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        {t("payroll.ruleSetLine", { quebec: result.meta.rulesVersion.quebec, federal: result.meta.rulesVersion.federal, status: result.meta.rulesVersion.status })}
      </p>
    </div>
  );
}
