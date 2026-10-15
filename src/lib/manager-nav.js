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

// Pages that only exist in the V3 menu (« Gestion V3 », chosen in the header).
const V3_ONLY_ITEMS = Object.freeze([
  { id: "todo", path: "todo", grant: null, labelKey: "mgr.nav.todo" },
  { id: "payroll-week", path: "payroll/week", grant: null, labelKey: "mgr.nav.payrollWeek" },
]);

// The V2 menu's items (the current Gestion) and every page either menu can open.
export const MANAGER_NAV_V2_ITEMS = Object.freeze(MANAGER_NAV.flatMap((group) => group.items));
export const MANAGER_NAV_ITEMS = Object.freeze([...MANAGER_NAV_V2_ITEMS, ...V3_ONLY_ITEMS]);

const byId = new Map(MANAGER_NAV_ITEMS.map((item) => [item.id, item]));
// A V3 entry reuses a page (same id, path and access rule), optionally with a clearer label.
const v3 = (id, labelKey) => (labelKey ? Object.freeze({ ...byId.get(id), labelKey }) : byId.get(id));

// V3 menu, built around the real routine with fewer visible entries: the timesheets every day
// or two (« Au quotidien »), the pay and its employer cost on Monday (« Paie »), the team.
// Every other page stays one click away in a group closed by default. `open` = expanded.
export const MANAGER_NAV_V3 = Object.freeze([
  { id: "today", labelKey: "mgr.group3.daily", open: true, items: [v3("todo"), v3("timesheets"), v3("live")] },
  { id: "payroll", labelKey: "mgr.group.payroll", open: true, items: [v3("payroll-week"), v3("reports-period")] },
  { id: "team", labelKey: "mgr.group.team", open: true, items: [v3("employees"), v3("absences"), v3("messages"), v3("inventory")] },
  { id: "time", labelKey: "mgr.group3.timeMore", open: false, items: [
    v3("receipts", "mgr.nav3.receipts"), v3("unlock-day"),
  ] },
  { id: "payroll-more", labelKey: "mgr.group3.payrollMore", open: false, items: [
    v3("payroll-stubs"), v3("payroll-das"), v3("payroll-calcul", "mgr.nav3.calcul"), v3("payroll-roe"),
    v3("reports-costs"), v3("reports-ccq"), v3("reports-downloads"),
  ] },
  { id: "config", labelKey: "mgr.group.config", open: false, items: [
    v3("config-settings"), v3("config-rules", "mgr.nav3.rules"), v3("forms"), v3("references"),
  ] },
  { id: "advanced", labelKey: "mgr.group.advanced", open: false, items: [
    v3("advanced-audit"), v3("advanced-pay-rules"), v3("advanced-health"), v3("advanced-emergency"),
  ] },
]);

export function managerNavFor(version) {
  return version === "v3" ? MANAGER_NAV_V3 : MANAGER_NAV;
}

// Same rule as canAccessSection: the menu and the route guard cannot disagree.
export function canOpenNavItem(role, adminSections, item) {
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
