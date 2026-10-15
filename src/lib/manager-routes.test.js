import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MANAGER_NAV_ITEMS, MANAGER_NAV_V2_ITEMS, MANAGER_NAV_V3 } from "./manager-nav";

// Source-level contract for the Gestion routes: every V2 path still opens the same page export,
// and each export still renders the same component with the same props. Read as text because the
// page modules need a Supabase client to load.
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const app = read("../App.jsx");
const pages = read("../pages/manager/ManagerPages.jsx");

function definition(source, name) {
  const one = source.match(new RegExp(`^export const ${name} = .*;$`, "m"));
  if (one) return one[0];
  const start = source.indexOf(`export function ${name}(`);
  if (start < 0) return null;
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}
const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const routeOf = (path) => app.match(new RegExp(`<Route path="${path.replace("/", "\\/")}" element=\\{<([A-Za-z]+) />\\} />`))?.[1] || null;

// Frozen from V2.4.131 (main before the V3 menu rework): path → page export → its definition.
// One-line exports are kept verbatim; multi-line ones by a hash of their source.
const V2_ROUTES = [
  ["live", "LivePage", { sha256: "d96df54375adfbbb" }],
  ["timesheets", "TimesheetsPage", `export const TimesheetsPage = () => <ManagerDashboard view="timesheet" />;`],
  ["receipts", "ReceiptsPage", `export const ReceiptsPage = () => <ManagerDashboard view="receipts" />;`],
  ["unlock-day", "UnlockDayPage", `export const UnlockDayPage = () => <Narrow><UnlockDayManager /></Narrow>;`],
  ["inventory", "InventoryPage", `export const InventoryPage = () => <InventoryScreenshotsPanel />;`],
  ["employees", "EmployeesPage", `export const EmployeesPage = () => <EmployeesPanel />;`],
  ["absences", "AbsencesPage", `export const AbsencesPage = () => <CongesManager />;`],
  ["forms", "FormsPage", `export const FormsPage = () => <FormsManager collapsible={false} />;`],
  ["payroll/calcul", "PayrollCalculPage", `export const PayrollCalculPage = () => <PayrollPage Component={PayrollEngineTester} writes />;`],
  ["payroll/stubs", "PayrollStubsPage", `export const PayrollStubsPage = () => <PayrollPage Component={TalonTab} />;`],
  ["payroll/das", "PayrollDasPage", `export const PayrollDasPage = () => <PayrollPage Component={DasTab} />;`],
  ["payroll/roe", "PayrollRoePage", { sha256: "c60c15fab439b31a" }],
  ["reports/costs", "CostsPage", `export const CostsPage = () => <CostingDashboard />;`],
  ["reports/period", "PeriodPage", { sha256: "ffeafcde8c3a595a" }],
  ["reports/ccq", "CcqPage", `export const CcqPage = () => <CcqRatesPanel />;`],
  ["reports/downloads", "DownloadsPage", `export const DownloadsPage = () => <ManagerDownloads />;`],
  ["messages", "MessagesPage", `export const MessagesPage = () => <Narrow><BroadcastManager /></Narrow>;`],
  ["config/rules", "RulesPage", `export const RulesPage = () => <Narrow><TimeRulesManager /></Narrow>;`],
  ["config/settings", "SettingsPage", `export const SettingsPage = () => <Narrow><SettingsPanel /></Narrow>;`],
  ["config/references", "ReferencesPage", `export const ReferencesPage = () => <ReferencesManager />;`],
  ["advanced/audit", "AuditPage", { sha256: "e789a4d492726656" }],
  ["advanced/health", "HealthPage", `export const HealthPage = () => <InfraHealthCard />;`],
  ["advanced/pay-rules", "PayRulesPage", `export const PayRulesPage = () => <PayRulesReference />;`],
  ["advanced/emergency", "EmergencyPage", `export const EmergencyPage = () => <EmergencyTimesheet />;`],
];

const METHOD_SWITCH_SHA = "7d604cef656cea81";
const METHOD_NOTE_SHA = "3bbddcb126d408e5";

describe("V2 routes lock", () => {
  it("routes every V2 menu path, and only those, through this table", () => {
    expect(V2_ROUTES.map(([path]) => path).sort()).toEqual(MANAGER_NAV_V2_ITEMS.map((item) => item.path).sort());
  });

  it.each(V2_ROUTES)("%s still opens %s, rendering the same component", (path, page, expected) => {
    expect(routeOf(path)).toBe(page);
    const def = definition(pages, page);
    if (typeof expected === "string") expect(def).toBe(expected);
    else expect(sha(def)).toBe(expected.sha256);
  });

  it("keeps the Méthode switch and banner the V2 payroll pages show, and their default rendering", () => {
    for (const [name, hash] of [["MethodSwitch", METHOD_SWITCH_SHA], ["MethodNote", METHOD_NOTE_SHA]]) {
      const start = pages.indexOf(`function ${name}(`);
      expect(sha(pages.slice(start, pages.indexOf("\n}\n", start) + 2)), name).toBe(hash);
    }
    // The V3 compact bar only replaces them when `compact` is passed; it defaults to false.
    expect(pages).toContain("function PayrollPage({ Component, writes = false, compact = false }) {");
    expect(pages).toContain("{compact ? <CompactMethodBar method={method} onChange={setMethod} /> : (\n        <>\n          <MethodSwitch method={method} onChange={setMethod} />\n          <MethodNote method={method} />");
  });

  it("keeps the wrappers the V2 pages render through", () => {
    expect(pages).toContain('function Narrow({ children }) {\n  return <div className="max-w-3xl">{children}</div>;\n}');
  });
});

describe("V3 routes", () => {
  it("routes every V3 entry", () => {
    for (const item of MANAGER_NAV_V3.flatMap((group) => group.items)) {
      expect(routeOf(item.path), item.path).not.toBeNull();
    }
  });

  it("gives every tab of every V3 page a content component", () => {
    for (const item of MANAGER_NAV_ITEMS.filter((i) => i.tabs)) {
      const exportName = routeOf(item.path);
      const def = definition(pages, exportName);
      const table = def.match(/content=\{([A-Z_]+)\}/)[1];
      const body = pages.slice(pages.indexOf(`const ${table} = {`), pages.indexOf("};", pages.indexOf(`const ${table} = {`)));
      for (const t of item.tabs) {
        expect(new RegExp(`(^|[\\s{,])"?${t.key}"?:`).test(body), `${item.id}:${t.key}`).toBe(true);
      }
    }
  });
});
