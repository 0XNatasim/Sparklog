import React, { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Info, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { MANAGER_NAV_ITEMS, firstAllowedPath, legacySectionTarget, resolveTab, visibleTabs } from "@/lib/manager-nav";
import { isManagerRole } from "@/lib/roles";
import { useManagerUiVersion } from "@/lib/manager-ui-version";
import { lazyPanel } from "@/components/LazyLoading";

// Each page loads on first visit, so employees never download manager code and a
// manager only fetches the pages they open (each shows its own fallback meanwhile).
const LiveCrew = lazyPanel(() => import("@/components/LiveCrew"));
const TodoInbox = lazyPanel(() => import("@/components/manager/TodoInbox"));
const PayrollWeek = lazyPanel(() => import("@/components/manager/PayrollWeek"));
const EmployeesPanel = lazyPanel(() => import("@/components/EmployeesPanel"));
const CongesManager = lazyPanel(() => import("@/components/CongesManager"));
const FormsManager = lazyPanel(() => import("@/components/FormsManager"));
const ReferencesManager = lazyPanel(() => import("@/components/ReferencesManager"));
const ContactsManager = lazyPanel(() => import("@/components/ContactsManager"));
const GroupsManager = lazyPanel(() => import("@/components/GroupsManager"));
const BroadcastManager = lazyPanel(() => import("@/components/BroadcastManager"));
const TimeRulesManager = lazyPanel(() => import("@/components/TimeRulesManager"));
const UnlockDayManager = lazyPanel(() => import("@/components/UnlockDayManager"));
const SettingsPanel = lazyPanel(() => import("@/components/SettingsPanel"));
const PayrollEngineTester = lazyPanel(() => import("@/components/PayrollEngineTester"));
const TalonTab = lazyPanel(() => import("@/components/TalonTab"));
const DasTab = lazyPanel(() => import("@/components/DasTab"));
const RecordOfEmploymentTab = lazyPanel(() => import("@/components/RecordOfEmploymentTab"));
const CostingDashboard = lazyPanel(() => import("@/components/CostingDashboard"));
const PeriodSummary = lazyPanel(() => import("@/components/PeriodSummary"));
const WeekViewTab = lazyPanel(() => import("@/components/WeekViewTab"));
const CcqRatesPanel = lazyPanel(() => import("@/components/CcqRatesPanel"));
const ManagerDownloads = lazyPanel(() => import("@/components/ManagerDownloads"));
const AuditLog = lazyPanel(() => import("@/components/AuditLog"));
const EmployeeActivityLog = lazyPanel(() => import("@/components/EmployeeActivityLog"));
const InfraHealthCard = lazyPanel(() => import("@/components/InfraHealthCard"));
const InventoryScreenshotsPanel = lazyPanel(() => import("@/components/InventoryScreenshotsPanel"));
const EmergencyTimesheet = lazyPanel(() => import("@/components/EmergencyTimesheet"));
const PayRulesReference = lazyPanel(() => import("@/components/PayRulesReference"));
const TravelRulesManager = lazyPanel(() => import("@/components/manager/TravelRulesManager"));
const NotesPanel = lazyPanel(() => import("@/components/manager/NotesPanel"));
const ManagerDashboard = lazyPanel(() => import("@/pages/ManagerDashboard"));
const CcqJsonExport = lazyPanel(() => import("@/components/CcqJsonExport"));

// #/manager → first page the user may open; old `?section=` links keep working.
export function ManagerIndex() {
  const { role, adminSections } = useAuth();
  const { search } = useLocation();
  const [version] = useManagerUiVersion();
  const legacy = legacySectionTarget(search);
  if (legacy) return <Navigate to={`/manager/${legacy}`} replace />;
  const first = firstAllowedPath(role, adminSections, isManagerRole(role) ? version : "v2");
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

// Gestion V3 pages.
export const TodoPage = () => <TodoInbox />;
export const PayrollWeekPage = () => <PayrollPage Component={PayrollWeek} writes compact />;

export const TimesheetsPage = () => <ManagerDashboard view="timesheet" />;
export const ReceiptsPage = () => <ManagerDashboard view="receipts" />;
export const InventoryPage = () => <InventoryScreenshotsPanel />;
export const EmployeesPage = () => <EmployeesPanel />;
export const AbsencesPage = () => <CongesManager />;
export const FormsPage = () => <FormsManager collapsible={false} />;
export const ReferencesPage = () => <ReferencesManager />;
export const MessagesPage = () => <Narrow><BroadcastManager /></Narrow>;
export const RulesPage = () => <Narrow><TimeRulesManager /></Narrow>;
export const UnlockDayPage = () => <Narrow><UnlockDayManager /></Narrow>;
export const SettingsPage = () => <Narrow><SettingsPanel /></Narrow>;
export const CostsPage = () => <CostingDashboard />;
export const CcqPage = () => <CcqRatesPanel />;
export const DownloadsPage = () => <ManagerDownloads />;
export const HealthPage = () => <InfraHealthCard />;
export const EmergencyPage = () => <EmergencyTimesheet />;
export const PayRulesPage = () => <PayRulesReference />;
export const TravelRulesPage = () => <TravelRulesManager />;
export const NotesPage = () => <NotesPanel />;

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
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
      <div className="font-semibold">{t("payroll.bookNote.title")}</div>
      <p className="mt-1">{t("payroll.bookNote.body")}</p>
    </div>
  );
}

// Gestion V3: the same Méthode choice as a small control; its explanation (the banner the V2
// shows) opens from an « i » button. Closes on Escape or a click outside.
function CompactMethodBar({ method, onChange }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    const onDown = (event) => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t("mgr.payroll.method")}</span>
      <div role="radiogroup" aria-label={t("mgr.payroll.method")} className="inline-flex rounded-md border bg-muted p-0.5">
        {METHODS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => onChange(value)}
            className={cn(
              "min-h-8 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              method === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(value === "messier" ? "mgr.payroll.messier" : "mgr.payroll.book")}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t("mgr.nav3.methodInfo")}
        title={t("mgr.nav3.methodInfo")}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div role="dialog" aria-label={t("mgr.nav3.methodInfo")} className="absolute left-0 top-full z-20 mt-1 w-[min(28rem,calc(100vw-2rem))] rounded-lg bg-popover shadow-lg">
          <MethodNote method={method} />
        </div>
      )}
    </div>
  );
}

// compact (Gestion V3 only): CompactMethodBar instead of the switch + banner. The default renders
// exactly the V2 page.
function PayrollPage({ Component, writes = false, compact = false }) {
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
      {compact ? <CompactMethodBar method={method} onChange={setMethod} /> : (
        <>
          <MethodSwitch method={method} onChange={setMethod} />
          <MethodNote method={method} />
        </>
      )}
      {writes && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
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

// ── Gestion V3: pages with tabs ─────────────────────────────────────────────
// Each tab renders the V2 page it comes from, unchanged (same component, same props). The active
// tab lives in the URL (?tab=); a tab this user may not open — or none at all — falls back to the
// first allowed one, and a page with no allowed tab sends back to #/manager. Only the active tab
// is mounted, so a tab loads its data only when it is opened.
const v3Item = (id) => MANAGER_NAV_ITEMS.find((item) => item.id === id);

function TabbedPage({ itemId, content }) {
  const t = useT();
  const { role, adminSections } = useAuth();
  const [params, setParams] = useSearchParams();
  const item = v3Item(itemId);
  const tabs = visibleTabs(item, role, adminSections);
  const requested = params.get("tab");
  const active = resolveTab(item, role, adminSections, requested);

  // Put the tab actually shown in the URL (replace: Back does not step through the correction).
  useEffect(() => {
    if (!active || requested === active) return;
    const next = new URLSearchParams(params);
    next.set("tab", active);
    setParams(next, { replace: true });
  }, [active, requested, params, setParams]);

  if (!active) return <Navigate to="/manager" replace />;

  function select(key) {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next);
  }

  const Content = content[active];
  return (
    <Tabs value={active} onValueChange={select} className="w-full">
      {tabs.length > 1 && (
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          {tabs.map((tabItem) => <TabsTrigger key={tabItem.key} value={tabItem.key}>{t(tabItem.labelKey)}</TabsTrigger>)}
        </TabsList>
      )}
      <div className={tabs.length > 1 ? "mt-3" : undefined}>{Content ? <Content /> : null}</div>
    </Tabs>
  );
}

const TODO_TABS = { todo: TodoPage, receipts: ReceiptsPage };
// V3 timesheets: same page, cards with the employee's name first and the « Entrées à la main »
// filter (the V2 page is unchanged).
const TIME_TABS = { timesheets: () => <ManagerDashboard view="timesheet" nameFirst manualFilter />, unlock: UnlockDayPage };
// Same pages as V2 Paie, with the compact Méthode control; Calcul détaillé keeps the « writes » warning.
const PAY_HISTORY_TABS = {
  stubs: () => <PayrollPage Component={TalonTab} compact />,
  das: () => <PayrollPage Component={DasTab} compact />,
  roe: PayrollRoePage,
  calcul: () => <PayrollPage Component={PayrollEngineTester} writes compact />,
};
const TEAM_TABS = { employees: EmployeesPage, absences: AbsencesPage, groups: () => <GroupsManager /> };
const REPORTS_TABS = {
  costs: CostsPage,
  week: () => <PeriodSummary mode="week" />,
  month: () => <PeriodSummary mode="month" />,
  grid: () => <WeekViewTab />,
  // CCQ export only: the DAS (already in Historique paie) and the « bientôt » bank card are left out.
  ccq: () => <CcqJsonExport />,
};
const CONFIG_TABS = {
  settings: SettingsPage, "time-rules": RulesPage, "ccq-rates": CcqPage, "pay-rules": PayRulesPage,
  forms: FormsPage, references: ReferencesPage, contacts: () => <ContactsManager />,
};

export const TodoTabsPage = () => <TabbedPage itemId="todo" content={TODO_TABS} />;
export const TimeHubPage = () => <TabbedPage itemId="v3-time" content={TIME_TABS} />;
export const PayHistoryPage = () => <TabbedPage itemId="v3-pay-history" content={PAY_HISTORY_TABS} />;
export const TeamHubPage = () => <TabbedPage itemId="v3-team" content={TEAM_TABS} />;
export const ReportsHubPage = () => <TabbedPage itemId="v3-reports" content={REPORTS_TABS} />;
export const ConfigHubPage = () => <TabbedPage itemId="v3-config" content={CONFIG_TABS} />;
