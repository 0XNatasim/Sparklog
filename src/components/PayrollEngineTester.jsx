import React, { useEffect, useState } from "react";
import { AlertTriangle, Calculator, ChevronDown, Save } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculatePayroll, RULE_VERSION } from "@/payroll";

const TAX_YEAR = 2026;
const EMPTY_YTD = { grossIncome: 0, rrqEmployee: 0, rrq2Employee: 0, eiEmployee: 0, rqapEmployee: 0, federalTax: 0, quebecTax: 0, pensionableIncomeRRQ: 0, insurableIncomeEI: 0, insurableIncomeRQAP: 0, labourStandardsIncome: 0 };

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

function Row({ label, value, strong }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${strong ? "border-t pt-2 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

// The Testing → Payroll bench. It contains NO tax logic — it only gathers input,
// calls calculatePayroll(input), and renders the result (spec steps 21-23 + the
// golden rule). Everything shown is a test-bench estimate, never finalized pay.
export default function PayrollEngineTester() {
  const [frequency, setFrequency] = useState("weekly");
  const [pay, setPay] = useState({ regularHours: 40, hourlyRate: 45.36, overtimeHours: 5, otMultiplier: 1.5, bonus: 0, vacation: 0, taxableBenefit: 0 });
  const [emp, setEmp] = useState({ td1ClaimAmount: "", personalTaxCredits: "", additionalFederal: 0, additionalQuebec: 0 });
  const [ytd, setYtd] = useState({ ...EMPTY_YTD });
  const [asOfDate, setAsOfDate] = useState("");
  const [employer, setEmployer] = useState({ annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 2.0, workforceSkillsFundApplicable: false });
  const [result, setResult] = useState(null);
  const [openExplain, setOpenExplain] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [saveState, setSaveState] = useState({ status: "idle", message: "" }); // idle|loading|saving|saved|error

  // Load the roster once. Errors are non-fatal — the bench still works manually.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, hourly_rate, apprentice_level")
        .order("full_name", { ascending: true });
      if (!cancelled) setEmployees(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // On employee change: prefill the hourly rate and load any saved YTD balances.
  async function handleSelectEmployee(id) {
    setSelectedId(id);
    setSaveState({ status: "idle", message: "" });
    if (!id) return;
    const profile = employees.find((e) => e.id === id);
    if (profile?.hourly_rate != null) setPay((s) => ({ ...s, hourlyRate: profile.hourly_rate }));

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
      });
      setAsOfDate(data.as_of_date || "");
      setSaveState({ status: "saved", message: "Loaded saved balances." });
    } else {
      setYtd({ ...EMPTY_YTD }); setAsOfDate("");
      setSaveState({ status: "idle", message: "No saved balances yet for this employee." });
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
    }, { onConflict: "user_id,tax_year" });
    setSaveState(error ? { status: "error", message: error.message } : { status: "saved", message: "Balances saved." });
  }

  const setP = (k) => (v) => setPay((s) => ({ ...s, [k]: v }));
  const setE = (k) => (v) => setEmp((s) => ({ ...s, [k]: v }));
  const setY = (k) => (v) => setYtd((s) => ({ ...s, [k]: v }));
  const setEr = (k) => (v) => setEmployer((s) => ({ ...s, [k]: v }));

  function handleCalculate() {
    const earnings = [];
    const regular = Number(pay.regularHours) * Number(pay.hourlyRate);
    const overtime = Number(pay.overtimeHours) * Number(pay.hourlyRate) * Number(pay.otMultiplier);
    if (regular) earnings.push({ type: "regular", amount: regular });
    if (overtime) earnings.push({ type: "overtime", amount: overtime });
    if (Number(pay.bonus)) earnings.push({ type: "bonus", amount: Number(pay.bonus) });
    if (Number(pay.vacation)) earnings.push({ type: "vacation", amount: Number(pay.vacation) });
    if (Number(pay.taxableBenefit)) earnings.push({ type: "taxableBenefit", amount: Number(pay.taxableBenefit) });

    setResult(calculatePayroll({
      taxYear: 2026,
      provinceOfEmployment: "QC",
      payPeriod: { frequency },
      employee: {
        federalTaxProfile: {
          td1ClaimAmount: emp.td1ClaimAmount === "" ? undefined : Number(emp.td1ClaimAmount),
          additionalTax: Number(emp.additionalFederal) || 0,
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
            <b>Test bench — not finalized payroll.</b> This is a deterministic DAS engine driven by an{" "}
            <b>unvalidated placeholder</b> 2026 rule set ({RULE_VERSION.quebec} / {RULE_VERSION.federal}).
            No constant has been checked against TP-1015.F / T4127. Validate against WebRAS &amp; PDOC and obtain
            specialist sign-off before any real use. Every result is <i>Requires payroll review</i>.
          </div>
        </div>
      </div>

      {/* ── Inputs ── */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">Province</span>
              <input value="Québec" disabled className="mt-1 w-full rounded-md border bg-muted/40 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Pay frequency</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="weekly">Weekly (52)</option>
                <option value="biweekly">Bi-weekly (26)</option>
                <option value="semimonthly">Semi-monthly (24)</option>
                <option value="monthly">Monthly (12)</option>
              </select>
            </label>
            <Field label="TD1 federal claim ($, blank = basic)" value={emp.td1ClaimAmount} onChange={setE("td1ClaimAmount")} step="1" />
            <Field label="QC personal credits ($, blank = basic)" value={emp.personalTaxCredits} onChange={setE("personalTaxCredits")} step="1" />
            <Field label="Extra federal tax / period" value={emp.additionalFederal} onChange={setE("additionalFederal")} />
            <Field label="Extra Québec tax / period" value={emp.additionalQuebec} onChange={setE("additionalQuebec")} />
          </div>
        </CardContent>
      </Card>

      <Section title="Pay (this period)">
        <Field label="Regular hours" value={pay.regularHours} onChange={setP("regularHours")} step="0.25" />
        <Field label="Hourly rate" value={pay.hourlyRate} onChange={setP("hourlyRate")} />
        <Field label="Overtime hours" value={pay.overtimeHours} onChange={setP("overtimeHours")} step="0.25" />
        <Field label="OT multiplier" value={pay.otMultiplier} onChange={setP("otMultiplier")} step="0.5" />
        <Field label="Bonus" value={pay.bonus} onChange={setP("bonus")} />
        <Field label="Vacation" value={pay.vacation} onChange={setP("vacation")} />
        <Field label="Taxable benefits" value={pay.taxableBenefit} onChange={setP("taxableBenefit")} />
      </Section>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Year-to-date opening balances ({TAX_YEAR}) — already paid this year
            </div>
            {selectedId && (
              <Button size="sm" variant="outline" onClick={handleSaveYtd} disabled={saveState.status === "saving"} className="text-xs">
                <Save className="mr-1.5 h-3.5 w-3.5" /> {saveState.status === "saving" ? "Saving…" : "Save for this employee"}
              </Button>
            )}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">Employee</span>
              <select value={selectedId} onChange={(e) => handleSelectEmployee(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="">— Manual (no employee) —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}{e.role && e.role !== "employee" ? ` · ${e.role}` : ""}</option>)}
              </select>
            </label>
            <Field label="Balances as of (last pay date)" value={asOfDate} onChange={setAsOfDate} type="date" step={undefined} />
          </div>

          {saveState.message && (
            <div className={`mb-3 text-xs ${saveState.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {saveState.status === "error" ? `Save/load unavailable: ${saveState.message}` : saveState.message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Gross YTD" value={ytd.grossIncome} onChange={setY("grossIncome")} />
            <Field label="RRQ YTD" value={ytd.rrqEmployee} onChange={setY("rrqEmployee")} />
            <Field label="RRQ2 YTD" value={ytd.rrq2Employee} onChange={setY("rrq2Employee")} />
            <Field label="EI YTD" value={ytd.eiEmployee} onChange={setY("eiEmployee")} />
            <Field label="RQAP YTD" value={ytd.rqapEmployee} onChange={setY("rqapEmployee")} />
            <Field label="Federal tax YTD" value={ytd.federalTax} onChange={setY("federalTax")} />
            <Field label="Québec tax YTD" value={ytd.quebecTax} onChange={setY("quebecTax")} />
            <Field label="Pensionable YTD (RRQ)" value={ytd.pensionableIncomeRRQ} onChange={setY("pensionableIncomeRRQ")} />
            <Field label="Insurable YTD (EI)" value={ytd.insurableIncomeEI} onChange={setY("insurableIncomeEI")} />
            <Field label="Insurable YTD (RQAP)" value={ytd.insurableIncomeRQAP} onChange={setY("insurableIncomeRQAP")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employer</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Annual payroll estimate" value={employer.annualPayrollEstimate} onChange={setEr("annualPayrollEstimate")} step="1000" />
            <label className="block text-xs">
              <span className="text-muted-foreground">FSS category</span>
              <select value={employer.fssCategory} onChange={(e) => setEr("fssCategory")(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="general">General</option>
                <option value="primary_manufacturing">Primary / manufacturing</option>
                <option value="public">Public sector</option>
              </select>
            </label>
            <Field label="CNESST rate (%)" value={employer.cnesstRate} onChange={setEr("cnesstRate")} />
            <label className="col-span-2 flex items-center gap-2 self-end text-xs sm:col-span-3">
              <input type="checkbox" checked={employer.workforceSkillsFundApplicable} onChange={(e) => setEr("workforceSkillsFundApplicable")(e.target.checked)} />
              <span className="text-muted-foreground">FDRCMO (workforce skills fund) applicable</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleCalculate} className="w-full sm:w-auto">
        <Calculator className="mr-2 h-4 w-4" /> Calculate payroll
      </Button>

      {result && <Results result={result} open={openExplain} setOpen={setOpenExplain} />}
    </div>
  );
}

function Results({ result, open, setOpen }) {
  if (!result.gross) {
    return (
      <Card>
        <CardContent className="p-4 text-sm">
          <div className="font-semibold text-amber-700 dark:text-amber-300">Requires payroll review</div>
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
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee</div>
          <Row label="Gross (total)" value={money(gross.total)} />
          <Row label="Federal tax" value={money(employee.federalTax)} />
          <Row label="Québec tax" value={money(employee.quebecTax)} />
          <Row label="RRQ" value={money(employee.rrq.total)} />
          <Row label="EI" value={money(employee.ei)} />
          <Row label="RQAP" value={money(employee.rqap)} />
          <Row label="Total deductions" value={money(employee.totalDeductions)} />
          <Row label="Net pay" value={money(employee.netPay)} strong />
        </CardContent></Card>

        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employer</div>
          <Row label="RRQ" value={money(employer.rrq)} />
          <Row label="EI" value={money(employer.ei)} />
          <Row label="RQAP" value={money(employer.rqap)} />
          <Row label="FSS" value={money(employer.fss)} />
          <Row label="Labour standards" value={money(employer.labourStandards)} />
          <Row label="FDRCMO" value={money(employer.workforceFund)} />
          <Row label="CNESST" value={money(employer.cnesst)} />
          <Row label="Total contributions" value={money(employer.totalContributions)} />
          <Row label="Total payroll cost" value={money(employer.totalPayrollCost)} strong />
        </CardContent></Card>

        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">DAS (remittances)</div>
          <Row label="Revenu Québec" value={money(das.quebec)} />
          <Row label="ARC (federal)" value={money(das.arc)} />
          <Row label="Total DAS" value={money(das.total)} strong />
          <div className="pt-2 text-[11px] text-muted-foreground">
            QC = Québec tax + RRQ + RQAP + FSS. ARC = federal tax + EI.
          </div>
        </CardContent></Card>
      </div>

      {/* Per-line calculation explanations (spec step 20) */}
      <Card>
        <CardContent className="p-0">
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
            <span>Calculation details</span>
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
        Rule set {result.meta.rulesVersion.quebec} / {result.meta.rulesVersion.federal} · status: {result.meta.rulesVersion.status}
      </p>
    </div>
  );
}
