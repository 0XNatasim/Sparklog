import {
  GRANTABLE_ADMIN_SECTIONS,
  canAccessSection,
  hasManagementAccess,
  isNonCcqRole,
  isPrivileged,
} from "./roles";

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

  return Object.freeze({
    role,
    paused: Boolean(paused),
    canLogOwnTime: knownRole && !paused,
    canManageAny: Object.values(sections).some(Boolean),
    managementSections: Object.freeze(sections),
    canAccessSensitiveNas: knownRole && isPrivileged(role),
    includedInCcqPayroll: knownRole && !isNonCcqRole(role),
  });
}

