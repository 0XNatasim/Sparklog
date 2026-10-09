import React from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { firstAllowedPath, legacySectionTarget } from "@/lib/manager-nav";
import LiveCrew from "@/components/LiveCrew";
import EmployeesPanel from "@/components/EmployeesPanel";
import CongesManager from "@/components/CongesManager";
import FormsManager from "@/components/FormsManager";
import BroadcastManager from "@/components/BroadcastManager";
import TimeRulesManager from "@/components/TimeRulesManager";
import SettingsPanel from "@/components/SettingsPanel";
import PayrollEngineTester from "@/components/PayrollEngineTester";
import TalonTab from "@/components/TalonTab";
import DasTab from "@/components/DasTab";
import RecordOfEmploymentTab from "@/components/RecordOfEmploymentTab";
import CostingDashboard from "@/components/CostingDashboard";
import PeriodSummary from "@/components/PeriodSummary";
import WeekViewTab from "@/components/WeekViewTab";
import CcqRatesPanel from "@/components/CcqRatesPanel";
import ManagerDownloads from "@/components/ManagerDownloads";
import AuditLog from "@/components/AuditLog";
import EmployeeActivityLog from "@/components/EmployeeActivityLog";
import InfraHealthCard from "@/components/InfraHealthCard";
import InventoryScreenshotsPanel from "@/components/InventoryScreenshotsPanel";
import EmergencyTimesheet from "@/components/EmergencyTimesheet";
import ManagerDashboard from "@/pages/ManagerDashboard";

// #/manager → first page the user may open; old `?section=` links keep working.
export function ManagerIndex() {
  const { role, adminSections } = useAuth();
  const { search } = useLocation();
  const legacy = legacySectionTarget(search);
  if (legacy) return <Navigate to={`/manager/${legacy}`} replace />;
  const first = firstAllowedPath(role, adminSections);
  return <Navigate to={first ? `/manager/${first}` : "/"} replace />;
}

// Setting forms stay readable; tables use the full width.
function Narrow({ children }) {
  return <div className="max-w-3xl">{children}</div>;
}

// Picking an employee opens their timesheet for that day (filters travel in the URL).
export function LivePage() {
  const navigate = useNavigate();
  return (
    <LiveCrew
      onSelectEmployee={(userId, date) => {
        const params = new URLSearchParams({ emp: userId });
        if (date) params.set("date", date);
        navigate(`/manager/timesheets?${params}`);
      }}
    />
  );
}

export const TimesheetsPage = () => <ManagerDashboard view="timesheet" />;
export const ReceiptsPage = () => <ManagerDashboard view="receipts" />;
export const InventoryPage = () => <InventoryScreenshotsPanel />;
export const EmployeesPage = () => <EmployeesPanel />;
export const AbsencesPage = () => <CongesManager />;
export const FormsPage = () => <FormsManager collapsible={false} />;
export const MessagesPage = () => <Narrow><BroadcastManager /></Narrow>;
export const RulesPage = () => <Narrow><TimeRulesManager /></Narrow>;
export const SettingsPage = () => <Narrow><SettingsPanel /></Narrow>;
export const CostsPage = () => <CostingDashboard />;
export const CcqPage = () => <CcqRatesPanel />;
export const DownloadsPage = () => <ManagerDownloads />;
export const HealthPage = () => <InfraHealthCard />;
export const EmergencyPage = () => <EmergencyTimesheet />;

// ── Paie: Méthode (Messier / Référence) is a page-level choice kept in the URL ──
const METHODS = ["messier", "book"];

function MethodSwitch({ method, onChange }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{t("mgr.payroll.method")}</span>
      <div role="radiogroup" aria-label={t("mgr.payroll.method")} className="inline-flex rounded-md border bg-muted p-0.5">
        {METHODS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => onChange(value)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              method === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(value === "messier" ? "mgr.payroll.messier" : "mgr.payroll.book")}
          </button>
        ))}
      </div>
    </div>
  );
}

function MethodNote({ method }) {
  const t = useT();
  return method === "messier" ? (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
      <div className="font-semibold">{t("payroll.messierNote.title")}</div>
      <p className="mt-1 text-muted-foreground">{t("payroll.messierNote.body")}</p>
    </div>
  ) : (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
      <div className="font-semibold">{t("payroll.bookNote.title")}</div>
      <p className="mt-1">{t("payroll.bookNote.body")}</p>
    </div>
  );
}

function PayrollPage({ Component, writes = false }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const method = METHODS.includes(params.get("method")) ? params.get("method") : "messier";
  const messier = method === "messier";
  function setMethod(value) {
    const next = new URLSearchParams(params);
    if (value === "messier") next.delete("method"); else next.set("method", value);
    setParams(next, { replace: true });
  }
  return (
    <div className="space-y-3">
      <MethodSwitch method={method} onChange={setMethod} />
      <MethodNote method={method} />
      {writes && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/50 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <Save className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("mgr.payroll.writesNote")}</span>
        </div>
      )}
      <Component messier={messier} />
    </div>
  );
}

export const PayrollCalculPage = () => <PayrollPage Component={PayrollEngineTester} writes />;
export const PayrollStubsPage = () => <PayrollPage Component={TalonTab} />;
export const PayrollDasPage = () => <PayrollPage Component={DasTab} />;

export function PayrollRoePage() {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">{t("mgr.roe.note")}</div>
      <RecordOfEmploymentTab />
    </div>
  );
}

// ── Rapports › Semaine / mois ───────────────────────────────────────────────
const PERIOD_VIEWS = ["week", "month", "grid"];

export function PeriodPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const view = PERIOD_VIEWS.includes(params.get("view")) ? params.get("view") : "week";
  function setView(value) {
    const next = new URLSearchParams(params);
    if (value === "week") next.delete("view"); else next.set("view", value);
    setParams(next, { replace: true });
  }
  return (
    <Tabs value={view} onValueChange={setView} className="w-full">
      <TabsList>
        <TabsTrigger value="week">{t("testing.tabs.week")}</TabsTrigger>
        <TabsTrigger value="month">{t("testing.tabs.month")}</TabsTrigger>
        <TabsTrigger value="grid">{t("testing.weekView.tab")}</TabsTrigger>
      </TabsList>
      <TabsContent value="week" className="mt-3"><PeriodSummary mode="week" /></TabsContent>
      <TabsContent value="month" className="mt-3"><PeriodSummary mode="month" /></TabsContent>
      <TabsContent value="grid" className="mt-3"><WeekViewTab /></TabsContent>
    </Tabs>
  );
}

// ── Avancé › Journal: manager actions · employee activity ───────────────────
export function AuditPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "employees" ? "employees" : "managers";
  function setView(value) {
    const next = new URLSearchParams(params);
    if (value === "managers") next.delete("view"); else next.set("view", value);
    setParams(next, { replace: true });
  }
  return (
    <Tabs value={view} onValueChange={setView} className="w-full">
      <TabsList>
        <TabsTrigger value="managers">{t("audit.tabs.managers")}</TabsTrigger>
        <TabsTrigger value="employees">{t("audit.tabs.employees")}</TabsTrigger>
      </TabsList>
      <TabsContent value="managers" className="mt-3"><AuditLog /></TabsContent>
      <TabsContent value="employees" className="mt-3"><EmployeeActivityLog /></TabsContent>
    </Tabs>
  );
}
