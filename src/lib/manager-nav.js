import { canAccessSection, isManagerRole, isOwnerRole } from "./roles";

// Gestion pages and their access rules.
//   grant — the GRANTABLE_ADMIN_SECTIONS id that also opens the page for an office admin;
//           null means manager/owner only (payroll, reports, settings, audit are never grantable).
//   ownerOnly — the page is reserved to the owner role (emergency timesheet).
// `path` is relative to #/manager. Keep ids in step with authorization-matrix.js.
//
// MANAGER_PAGES are the pages of the former menu (V2, removed in V2.4.186). Some are menu entries
// as they are (live, inventory, messages, journal, service status, emergency timesheet); the others
// are now tabs of a page and lend it their rule (`from`). Their old paths redirect (OLD_PATHS).
export const MANAGER_PAGES = Object.freeze([
  { id: "live", path: "live", grant: "live", labelKey: "mgr.nav.live" },
  { id: "timesheets", path: "timesheets", grant: "timesheet", labelKey: "mgr.nav.timesheets" },
  { id: "receipts", path: "receipts", grant: "notifications", labelKey: "mgr.nav.receipts" },
  { id: "unlock-day", path: "unlock-day", grant: "employees", labelKey: "mgr.nav.unlockDay" },
  { id: "employees", path: "employees", grant: "employees", labelKey: "mgr.nav.employees" },
  { id: "absences", path: "absences", grant: null, labelKey: "mgr.nav.absences" },
  { id: "inventory", path: "inventory", grant: null, labelKey: "mgr.nav.inventory" },
  { id: "payroll-calcul", path: "payroll/calcul", grant: null, labelKey: "mgr.nav.calcul" },
  { id: "payroll-stubs", path: "payroll/stubs", grant: null, labelKey: "mgr.nav.stubs" },
  { id: "payroll-das", path: "payroll/das", grant: null, labelKey: "mgr.nav.das" },
  { id: "payroll-roe", path: "payroll/roe", grant: null, labelKey: "mgr.nav.roe" },
  { id: "reports-costs", path: "reports/costs", grant: null, labelKey: "mgr.nav.costs" },
  { id: "reports-period", path: "reports/period", grant: null, labelKey: "mgr.nav.period" },
  { id: "reports-ccq", path: "reports/ccq", grant: null, labelKey: "mgr.nav.ccq" },
  { id: "reports-downloads", path: "reports/downloads", grant: null, labelKey: "mgr.nav.downloads" },
  { id: "messages", path: "messages", grant: "notifications", labelKey: "mgr.nav.messages" },
  { id: "config-settings", path: "config/settings", grant: null, labelKey: "mgr.nav.settings" },
  { id: "forms", path: "forms", grant: "forms", labelKey: "mgr.nav.forms" },
  { id: "references", path: "config/references", grant: null, labelKey: "mgr.nav.references" },
  { id: "advanced-audit", path: "advanced/audit", grant: null, labelKey: "mgr.nav.audit" },
  { id: "advanced-health", path: "advanced/health", grant: null, labelKey: "mgr.nav.health" },
  { id: "advanced-pay-rules", path: "advanced/pay-rules", grant: null, labelKey: "mgr.nav.payRules" },
  { id: "advanced-emergency", path: "advanced/emergency", grant: null, ownerOnly: true, labelKey: "mgr.nav.emergency" },
].map((item) => Object.freeze(item)));

// ── Menu entries ────────────────────────────────────────────────────────────
// Related pages are grouped into pages with tabs (paths v3/… kept from Gestion V3, so links stay
// valid). A tab keeps the access rule of the page it comes from: `from` = that page's id, or an
// inline { grant, ownerOnly } rule. An entry with tabs opens when at least one of its tabs does.
const tab = (key, from, labelKey) => Object.freeze({ key, from, labelKey });

const MENU_ONLY_ITEMS = Object.freeze([
  { id: "todo", path: "todo", grant: null, labelKey: "mgr.nav.todo", tabs: [
    Object.freeze({ key: "todo", grant: null, labelKey: "mgr.nav3.tab.toApprove" }),
    tab("receipts", "receipts", "mgr.nav.receipts"),
  ] },
  { id: "payroll-week", path: "payroll/week", grant: null, labelKey: "mgr.nav.payrollWeek" },
  // My own notes and reminders (0111): private to each manager / owner.
  { id: "notes", path: "notes", grant: null, labelKey: "mgr.nav3.notes" },
  // Trajets, km et frais: one setting per employee and per line (NOOB.md étape 7). Manager / owner only.
  { id: "advanced-travel-rules", path: "advanced/travel-rules", grant: null, labelKey: "mgr.nav3.travelRules" },
  { id: "v3-time", path: "v3/time", grant: null, labelKey: "mgr.nav.timesheets", tabs: [
    tab("timesheets", "timesheets", "mgr.nav.timesheets"),
    tab("unlock", "unlock-day", "mgr.nav3.tab.unlockDay"),
    // Jours sans saisie: the count of Avancé › Journal › Employés, with the dates (same rule).
    tab("missing", "advanced-audit", "mgr.nav3.tab.missingDays"),
  ] },
  { id: "v3-pay-history", path: "v3/pay-history", grant: null, labelKey: "mgr.nav3.payHistory", tabs: [
    tab("stubs", "payroll-stubs", "mgr.nav.stubs"),
    tab("das", "payroll-das", "mgr.nav.das"),
    tab("roe", "payroll-roe", "mgr.nav.roe"),
    tab("calcul", "payroll-calcul", "mgr.nav3.tab.calcul"),
  ] },
  { id: "v3-team", path: "v3/team", grant: null, labelKey: "mgr.nav.employees", tabs: [
    tab("employees", "employees", "mgr.nav.employees"),
    tab("absences", "absences", "mgr.nav.absences"),
    // Groupes d'employés (0114): same rule as the Employés page.
    tab("groups", "employees", "mgr.nav3.tab.groups"),
  ] },
  { id: "v3-reports", path: "v3/reports", grant: null, labelKey: "mgr.nav3.reports", tabs: [
    tab("costs", "reports-costs", "mgr.nav.costs"),
    tab("week", "reports-period", "mgr.nav3.tab.week"),
    tab("month", "reports-period", "mgr.nav3.tab.month"),
    tab("grid", "reports-period", "mgr.nav3.tab.grid"),
    tab("ccq", "reports-downloads", "mgr.nav3.tab.ccqExport"),
  ] },
  { id: "v3-config", path: "v3/config", grant: null, labelKey: "mgr.nav3.config", tabs: [
    tab("settings", "config-settings", "mgr.nav.settings"),
    tab("ccq-rates", "reports-ccq", "mgr.nav.ccq"),
    tab("pay-rules", "advanced-pay-rules", "mgr.nav.payRules"),
    tab("forms", "forms", "mgr.nav.forms"),
    tab("references", "references", "mgr.nav.references"),
    tab("contacts", "references", "mgr.nav3.tab.contacts"),
  ] },
].map((item) => Object.freeze({ ...item, ...(item.tabs ? { tabs: Object.freeze(item.tabs) } : {}) })));

// Every page and menu entry (rules for the route guard and authorization-matrix.js).
export const MANAGER_NAV_ITEMS = Object.freeze([...MANAGER_PAGES, ...MENU_ONLY_ITEMS]);

const byId = new Map(MANAGER_NAV_ITEMS.map((item) => [item.id, item]));
const entry = (id) => byId.get(id);

// The menu: the day's work first (« Aujourd'hui »), the weekly payroll next; the rest closed.
// `open` = group expanded by default (a one-entry group always shows its entry).
export const MANAGER_NAV = Object.freeze([
  { id: "today", labelKey: "mgr.group.today", open: true, items: [entry("todo"), entry("live"), entry("notes")] },
  { id: "time", labelKey: "mgr.group.time", open: false, items: [entry("v3-time")] },
  { id: "payroll", labelKey: "mgr.group.payroll", open: true, items: [entry("payroll-week"), entry("v3-pay-history")] },
  { id: "team", labelKey: "mgr.group.team", open: false, items: [entry("v3-team"), entry("inventory"), entry("messages")] },
  { id: "reports", labelKey: "mgr.group.reports", open: false, items: [entry("v3-reports")] },
  { id: "config", labelKey: "mgr.group.config", open: false, items: [entry("v3-config")] },
  { id: "advanced", labelKey: "mgr.nav3.group.admin", open: false, items: [
    entry("advanced-travel-rules"), entry("advanced-audit"), entry("advanced-health"), entry("advanced-emergency"),
  ] },
]);

// The access rule a tab carries: its source page, or its inline rule.
function tabRule(t) {
  return t.from ? byId.get(t.from) : t;
}

// Tabs of a menu entry this user may open, in order.
export function visibleTabs(item, role, adminSections) {
  return (item?.tabs || []).filter((t) => canOpenNavItem(role, adminSections, tabRule(t)));
}

// The tab to show for `requested` (?tab=): it when allowed, else the first allowed one, else null.
export function resolveTab(item, role, adminSections, requested) {
  const allowed = visibleTabs(item, role, adminSections);
  return (allowed.find((t) => t.key === requested) || allowed[0] || null)?.key ?? null;
}

// Same rule as canAccessSection: the menu and the route guard cannot disagree.
export function canOpenNavItem(role, adminSections, item) {
  if (item.tabs) return item.tabs.some((t) => canOpenNavItem(role, adminSections, tabRule(t)));
  if (item.ownerOnly) return isOwnerRole(role);
  return item.grant ? canAccessSection(role, adminSections, item.grant) : isManagerRole(role);
}

export function visibleManagerNav(role, adminSections) {
  return MANAGER_NAV
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpenNavItem(role, adminSections, item)) }))
    .filter((group) => group.items.length > 0);
}

const cleanPath = (path) => String(path || "").replace(/^\/+|\/+$/g, "");
const withQuery = (path, params) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

// The menu entry at `path` (for the header title and the route guard).
export function findNavItem(path) {
  const clean = cleanPath(path);
  return MANAGER_NAV.flatMap((group) => group.items).find((item) => item.path === clean) || null;
}

// First page the user may open — the landing page for #/manager (À traiter for managers).
export function firstAllowedPath(role, adminSections) {
  return visibleManagerNav(role, adminSections)[0]?.items[0]?.path || null;
}

// ── Old paths (the V2 menu, removed in V2.4.186) ────────────────────────────
// Bookmarks and old links open the page and tab that hold them now. Paths the menu still uses
// (live, inventory, messages, journal, service status, emergency timesheet) are not listed.
export const OLD_PATHS = Object.freeze({
  timesheets: { path: "v3/time", tab: "timesheets" },
  "unlock-day": { path: "v3/time", tab: "unlock" },
  receipts: { path: "todo", tab: "receipts" },
  employees: { path: "v3/team", tab: "employees" },
  absences: { path: "v3/team", tab: "absences" },
  payroll: { path: "v3/pay-history", tab: "stubs" },
  reports: { path: "v3/reports", tab: "costs" },
  config: { path: "v3/config", tab: "settings" },
  "payroll/stubs": { path: "v3/pay-history", tab: "stubs" },
  "payroll/das": { path: "v3/pay-history", tab: "das" },
  "payroll/roe": { path: "v3/pay-history", tab: "roe" },
  "payroll/calcul": { path: "v3/pay-history", tab: "calcul" },
  "reports/costs": { path: "v3/reports", tab: "costs" },
  "reports/period": { path: "v3/reports", tab: "week" }, // ?view=month|grid → that tab
  "reports/downloads": { path: "v3/reports", tab: "ccq" },
  "config/settings": { path: "v3/config", tab: "settings" },
  "config/rules": { path: "v3/team", tab: "employees" }, // Règles de temps: in each employee's card
  "reports/ccq": { path: "v3/config", tab: "ccq-rates" },
  "advanced/pay-rules": { path: "v3/config", tab: "pay-rules" },
  forms: { path: "v3/config", tab: "forms" },
  "config/references": { path: "v3/config", tab: "references" },
});
const PERIOD_VIEW_TABS = ["month", "grid"]; // Semaine / mois's ?view= values that are tabs now

// Where an old path + query lands now, keeping the other parameters (employee, day, filter, job,
// method…); null when `path` is not an old path.
export function oldPathTarget(path, search = "") {
  const clean = cleanPath(path);
  const eq = OLD_PATHS[clean];
  if (!eq) return null;
  const params = new URLSearchParams(search);
  let tabKey = eq.tab;
  if (clean === "reports/period") {
    if (PERIOD_VIEW_TABS.includes(params.get("view"))) tabKey = params.get("view");
    params.delete("view");
  }
  params.set("tab", tabKey);
  return withQuery(eq.path, params);
}

// Old `/manager?section=…` links (bell notifications, bookmarks) → new route + query string.
const LEGACY_SECTIONS = {
  live: "live",
  timesheet: "timesheets",
  notifications: "receipts",
  overtime: "receipts",
  meals: "receipts",
  parking: "receipts",
  employees: "employees",
  conges: "absences",
  forms: "forms",
  settings: "config/settings",
  testing: "reports/costs",
};

export function legacySectionTarget(search) {
  const params = new URLSearchParams(search);
  const section = params.get("section");
  const path = section ? LEGACY_SECTIONS[section] : null;
  if (!path) return null;
  params.delete("section");
  if (["overtime", "meals", "parking"].includes(section)) params.set("filter", section);
  return oldPathTarget(path, params.toString()) || withQuery(path, params);
}
