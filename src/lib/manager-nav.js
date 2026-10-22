import { canAccessSection, isManagerRole, isOwnerRole } from "./roles";

// Gestion navigation: one entry per destination, grouped for the sidebar.
//   grant — the GRANTABLE_ADMIN_SECTIONS id that also opens the page for an office admin;
//           null means manager/owner only (payroll, reports, settings, audit are never grantable).
//   ownerOnly — the page is reserved to the owner role (emergency timesheet).
// `path` is relative to #/manager. Keep ids in step with authorization-matrix.js.
export const MANAGER_NAV = Object.freeze([
  { id: "today", labelKey: "mgr.group.today", items: [
    { id: "live", path: "live", grant: "live", labelKey: "mgr.nav.live" },
  ] },
  { id: "time", labelKey: "mgr.group.time", items: [
    { id: "timesheets", path: "timesheets", grant: "timesheet", labelKey: "mgr.nav.timesheets" },
    { id: "receipts", path: "receipts", grant: "notifications", labelKey: "mgr.nav.receipts" },
    { id: "unlock-day", path: "unlock-day", grant: "employees", labelKey: "mgr.nav.unlockDay" },
  ] },
  { id: "team", labelKey: "mgr.group.team", items: [
    { id: "employees", path: "employees", grant: "employees", labelKey: "mgr.nav.employees" },
    { id: "absences", path: "absences", grant: null, labelKey: "mgr.nav.absences" },
    { id: "inventory", path: "inventory", grant: null, labelKey: "mgr.nav.inventory" },
  ] },
  { id: "payroll", labelKey: "mgr.group.payroll", items: [
    { id: "payroll-calcul", path: "payroll/calcul", grant: null, labelKey: "mgr.nav.calcul" },
    { id: "payroll-stubs", path: "payroll/stubs", grant: null, labelKey: "mgr.nav.stubs" },
    { id: "payroll-das", path: "payroll/das", grant: null, labelKey: "mgr.nav.das" },
    { id: "payroll-roe", path: "payroll/roe", grant: null, labelKey: "mgr.nav.roe" },
  ] },
  { id: "reports", labelKey: "mgr.group.reports", items: [
    { id: "reports-costs", path: "reports/costs", grant: null, labelKey: "mgr.nav.costs" },
    { id: "reports-period", path: "reports/period", grant: null, labelKey: "mgr.nav.period" },
    { id: "reports-ccq", path: "reports/ccq", grant: null, labelKey: "mgr.nav.ccq" },
    { id: "reports-downloads", path: "reports/downloads", grant: null, labelKey: "mgr.nav.downloads" },
  ] },
  { id: "messages", labelKey: "mgr.group.messages", items: [
    { id: "messages", path: "messages", grant: "notifications", labelKey: "mgr.nav.messages" },
  ] },
  { id: "config", labelKey: "mgr.group.config", items: [
    { id: "config-rules", path: "config/rules", grant: "employees", labelKey: "mgr.nav.rules" },
    { id: "config-settings", path: "config/settings", grant: null, labelKey: "mgr.nav.settings" },
    { id: "forms", path: "forms", grant: "forms", labelKey: "mgr.nav.forms" },
    { id: "references", path: "config/references", grant: null, labelKey: "mgr.nav.references" },
  ] },
  { id: "advanced", labelKey: "mgr.group.advanced", items: [
    { id: "advanced-audit", path: "advanced/audit", grant: null, labelKey: "mgr.nav.audit" },
    { id: "advanced-health", path: "advanced/health", grant: null, labelKey: "mgr.nav.health" },
    { id: "advanced-pay-rules", path: "advanced/pay-rules", grant: null, labelKey: "mgr.nav.payRules" },
    { id: "advanced-emergency", path: "advanced/emergency", grant: null, ownerOnly: true, labelKey: "mgr.nav.emergency" },
  ] },
]);

// ── Gestion V3 ──────────────────────────────────────────────────────────────
// The V3 menu groups related V2 pages into pages with tabs, on NEW paths (v3/…). Every V2 path
// stays routed to its V2 page, so notification links and bookmarks keep working in both versions.
// A tab keeps the access rule of the page it comes from: `from` = that V2 page's id, or an inline
// { grant, ownerOnly } rule. An entry with tabs opens when at least one of its tabs does.
const tab = (key, from, labelKey) => Object.freeze({ key, from, labelKey });

// Pages that only exist in the V3 menu (« Gestion V3 », chosen in the header).
const V3_ONLY_ITEMS = Object.freeze([
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
    tab("time-rules", "config-rules", "mgr.nav.rules"),
    tab("ccq-rates", "reports-ccq", "mgr.nav.ccq"),
    tab("pay-rules", "advanced-pay-rules", "mgr.nav.payRules"),
    tab("forms", "forms", "mgr.nav.forms"),
    tab("references", "references", "mgr.nav.references"),
    tab("contacts", "references", "mgr.nav3.tab.contacts"),
  ] },
].map((item) => Object.freeze({ ...item, ...(item.tabs ? { tabs: Object.freeze(item.tabs) } : {}) })));

// The V2 menu's items (the current Gestion) and every page either menu can open.
export const MANAGER_NAV_V2_ITEMS = Object.freeze(MANAGER_NAV.flatMap((group) => group.items));
export const MANAGER_NAV_ITEMS = Object.freeze([...MANAGER_NAV_V2_ITEMS, ...V3_ONLY_ITEMS]);

const byId = new Map(MANAGER_NAV_ITEMS.map((item) => [item.id, item]));
const v3 = (id) => byId.get(id);

// V3 menu: the day's work first (« Aujourd'hui »), the weekly payroll next; the rest closed.
// `open` = group expanded by default (a one-entry group always shows its entry).
export const MANAGER_NAV_V3 = Object.freeze([
  { id: "today", labelKey: "mgr.group.today", open: true, items: [v3("todo"), v3("live"), v3("notes")] },
  { id: "time", labelKey: "mgr.group.time", open: false, items: [v3("v3-time")] },
  { id: "payroll", labelKey: "mgr.group.payroll", open: true, items: [v3("payroll-week"), v3("v3-pay-history")] },
  { id: "team", labelKey: "mgr.group.team", open: false, items: [v3("v3-team"), v3("inventory"), v3("messages")] },
  { id: "reports", labelKey: "mgr.group.reports", open: false, items: [v3("v3-reports")] },
  { id: "config", labelKey: "mgr.group.config", open: false, items: [v3("v3-config")] },
  { id: "advanced", labelKey: "mgr.nav3.group.admin", open: false, items: [
    v3("advanced-travel-rules"), v3("advanced-audit"), v3("advanced-health"), v3("advanced-emergency"),
  ] },
]);

// The access rule a tab carries: its source page, or its inline rule.
function tabRule(t) {
  return t.from ? byId.get(t.from) : t;
}

// Tabs of a V3 entry this user may open, in order.
export function visibleTabs(item, role, adminSections) {
  return (item?.tabs || []).filter((t) => canOpenNavItem(role, adminSections, tabRule(t)));
}

// The tab to show for `requested` (?tab=): it when allowed, else the first allowed one, else null.
export function resolveTab(item, role, adminSections, requested) {
  const allowed = visibleTabs(item, role, adminSections);
  return (allowed.find((t) => t.key === requested) || allowed[0] || null)?.key ?? null;
}

export function managerNavFor(version) {
  return version === "v3" ? MANAGER_NAV_V3 : MANAGER_NAV;
}

// Same rule as canAccessSection: the menu and the route guard cannot disagree.
export function canOpenNavItem(role, adminSections, item) {
  if (item.tabs) return item.tabs.some((t) => canOpenNavItem(role, adminSections, tabRule(t)));
  if (item.ownerOnly) return isOwnerRole(role);
  return item.grant ? canAccessSection(role, adminSections, item.grant) : isManagerRole(role);
}

export function visibleManagerNav(role, adminSections, version = "v2") {
  return managerNavFor(version)
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpenNavItem(role, adminSections, item)) }))
    .filter((group) => group.items.length > 0);
}

// The page at `path`, with the label the given menu version shows for it.
export function findNavItem(path, version = "v2") {
  const clean = String(path || "").replace(/^\/+|\/+$/g, "");
  const inMenu = managerNavFor(version).flatMap((group) => group.items).find((item) => item.path === clean);
  return inMenu || MANAGER_NAV_ITEMS.find((item) => item.path === clean) || null;
}

// First page the user may open — the landing page for #/manager (Équipe en direct for managers).
export function firstAllowedPath(role, adminSections, version = "v2") {
  return visibleManagerNav(role, adminSections, version)[0]?.items[0]?.path || null;
}

// ── V2 ↔ V3 equivalences (switching versions keeps the page) ─────────────────
// V2 path → the V3 page and tab that show it. Paths both menus share (live, inventory, messages,
// journal, état du service, feuille d'urgence) are not listed: they stay the same.
export const V2_TO_V3 = Object.freeze({
  timesheets: { path: "v3/time", tab: "timesheets" },
  "unlock-day": { path: "v3/time", tab: "unlock" },
  receipts: { path: "todo", tab: "receipts" },
  employees: { path: "v3/team", tab: "employees" },
  absences: { path: "v3/team", tab: "absences" },
  "payroll/stubs": { path: "v3/pay-history", tab: "stubs" },
  "payroll/das": { path: "v3/pay-history", tab: "das" },
  "payroll/roe": { path: "v3/pay-history", tab: "roe" },
  "payroll/calcul": { path: "v3/pay-history", tab: "calcul" },
  "reports/costs": { path: "v3/reports", tab: "costs" },
  "reports/period": { path: "v3/reports", tab: "week" }, // ?view=month|grid → that tab
  "reports/downloads": { path: "v3/reports", tab: "ccq" },
  "config/settings": { path: "v3/config", tab: "settings" },
  "config/rules": { path: "v3/config", tab: "time-rules" },
  "reports/ccq": { path: "v3/config", tab: "ccq-rates" },
  "advanced/pay-rules": { path: "v3/config", tab: "pay-rules" },
  forms: { path: "v3/config", tab: "forms" },
  "config/references": { path: "v3/config", tab: "references" },
});
const PERIOD_VIEW_TABS = ["month", "grid"]; // Semaine / mois's ?view= values that are V3 tabs

const cleanPath = (path) => String(path || "").replace(/^\/+|\/+$/g, "");
const withQuery = (path, params) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};
const inMenu = (version, path) => managerNavFor(version).some((group) => group.items.some((item) => item.path === path));

// Where switching to `next` ("v2" | "v3") should land from `path` + `search`, keeping the other
// query parameters (employee, day, filter, job, method…). null = no equivalent: the landing page.
export function switchTarget(next, path, search = "") {
  const clean = cleanPath(path);
  const params = new URLSearchParams(search);
  if (next === "v3") {
    const eq = V2_TO_V3[clean];
    if (!eq) return inMenu("v3", clean) ? withQuery(clean, params) : null;
    let tabKey = eq.tab;
    if (clean === "reports/period") {
      if (PERIOD_VIEW_TABS.includes(params.get("view"))) tabKey = params.get("view");
      params.delete("view");
    }
    params.set("tab", tabKey);
    return withQuery(eq.path, params);
  }
  const page = MANAGER_NAV_ITEMS.find((item) => item.tabs && item.path === clean);
  if (!page) return inMenu("v2", clean) ? withQuery(clean, params) : null;
  const tabKey = page.tabs.some((t) => t.key === params.get("tab")) ? params.get("tab") : page.tabs[0].key;
  params.delete("tab");
  if (page.id === "v3-reports" && PERIOD_VIEW_TABS.includes(tabKey)) {
    params.set("view", tabKey);
    return withQuery("reports/period", params);
  }
  const v2 = Object.entries(V2_TO_V3).find(([, eq]) => eq.path === clean && eq.tab === tabKey)?.[0];
  return v2 ? withQuery(v2, params) : null;
}

// In V3, a V2 path opened by a notification or a bookmark highlights the V3 entry that holds it.
export function v3MenuPath(path) {
  const clean = cleanPath(path);
  return V2_TO_V3[clean]?.path || clean;
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
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
