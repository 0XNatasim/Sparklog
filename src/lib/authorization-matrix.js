import {
  GRANTABLE_ADMIN_SECTIONS,
  canAccessSection,
  hasManagementAccess,
  isNonCcqRole,
  isPrivileged,
} from "./roles";
import { MANAGER_NAV_ITEMS, canOpenNavItem, visibleTabs } from "./manager-nav";

export const APPLICATION_ROLES = Object.freeze([
  "employee",
  "subcontractor_1",
  "admin",
  "manager",
  "owner",
]);

// Executable role × operation contract used by route guards, tests and future UI
// decisions. Pausing contains personal writes without silently changing the role.
export function authorizationFor({ role, adminSections = [], paused = false }) {
  const knownRole = APPLICATION_ROLES.includes(role);
  const sections = Object.fromEntries(
    GRANTABLE_ADMIN_SECTIONS.map((section) => [
      section,
      knownRole && hasManagementAccess(role, adminSections)
        && canAccessSection(role, adminSections, section),
    ])
  );

  // Every Gestion page (sidebar entry), by id — payroll, reports, settings and audit are
  // manager/owner only because no grantable section maps to them.
  const pages = Object.fromEntries(
    MANAGER_NAV_ITEMS.map((item) => [item.id, knownRole && canOpenNavItem(role, adminSections, item)])
  );

  // Gestion V3 pages with tabs: each tab keeps the rule of the page it comes from; the page
  // itself opens when at least one tab does (see `pages`).
  const tabs = Object.fromEntries(
    MANAGER_NAV_ITEMS.filter((item) => item.tabs).map((item) => {
      const allowed = new Set(knownRole ? visibleTabs(item, role, adminSections).map((t) => t.key) : []);
      return [item.id, Object.freeze(Object.fromEntries(item.tabs.map((t) => [t.key, allowed.has(t.key)])))];
    })
  );

  return Object.freeze({
    role,
    pages: Object.freeze(pages),
    tabs: Object.freeze(tabs),
    paused: Boolean(paused),
    canLogOwnTime: knownRole && !paused,
    canManageAny: Object.values(sections).some(Boolean),
    managementSections: Object.freeze(sections),
    canAccessSensitiveNas: knownRole && isPrivileged(role),
    includedInCcqPayroll: knownRole && !isNonCcqRole(role),
  });
}

