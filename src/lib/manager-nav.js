import { canAccessSection, isManagerRole } from "./roles";

// Gestion navigation: one entry per destination, grouped for the sidebar.
//   grant — the GRANTABLE_ADMIN_SECTIONS id that also opens the page for an office admin;
//           null means manager/owner only (payroll, reports, settings, audit are never grantable).
// `path` is relative to #/manager. Keep ids in step with authorization-matrix.js.
export const MANAGER_NAV = Object.freeze([
  { id: "today", labelKey: "mgr.group.today", items: [
    { id: "live", path: "live", grant: "live", labelKey: "mgr.nav.live" },
  ] },
  { id: "time", labelKey: "mgr.group.time", items: [
    { id: "timesheets", path: "timesheets", grant: "timesheet", labelKey: "mgr.nav.timesheets" },
    { id: "receipts", path: "receipts", grant: "notifications", labelKey: "mgr.nav.receipts" },
  ] },
  { id: "team", labelKey: "mgr.group.team", items: [
    { id: "employees", path: "employees", grant: "employees", labelKey: "mgr.nav.employees" },
    { id: "absences", path: "absences", grant: null, labelKey: "mgr.nav.absences" },
    { id: "forms", path: "forms", grant: "forms", labelKey: "mgr.nav.forms" },
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
  ] },
  { id: "advanced", labelKey: "mgr.group.advanced", items: [
    { id: "advanced-audit", path: "advanced/audit", grant: null, labelKey: "mgr.nav.audit" },
    { id: "advanced-health", path: "advanced/health", grant: null, labelKey: "mgr.nav.health" },
  ] },
]);

export const MANAGER_NAV_ITEMS = Object.freeze(MANAGER_NAV.flatMap((group) => group.items));

// Same rule as canAccessSection: the menu and the route guard cannot disagree.
export function canOpenNavItem(role, adminSections, item) {
  return item.grant ? canAccessSection(role, adminSections, item.grant) : isManagerRole(role);
}

export function visibleManagerNav(role, adminSections) {
  return MANAGER_NAV
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpenNavItem(role, adminSections, item)) }))
    .filter((group) => group.items.length > 0);
}

export function findNavItem(path) {
  const clean = String(path || "").replace(/^\/+|\/+$/g, "");
  return MANAGER_NAV_ITEMS.find((item) => item.path === clean) || null;
}

// First page the user may open — the landing page for #/manager (Équipe en direct for managers).
export function firstAllowedPath(role, adminSections) {
  return visibleManagerNav(role, adminSections)[0]?.items[0]?.path || null;
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
