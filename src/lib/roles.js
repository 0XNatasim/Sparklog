// Role helpers. Roles are stored lowercase: 'employee', 'manager', 'admin', 'owner'.
//
// Tiers:
//   employee — the crew (CCQ tradesperson)
//   admin    — administration/office: a NON-manager office EMPLOYEE, paid flat-hourly
//              (non-CCQ). Logs a simplified timesheet like an employee; has NO manager
//              reach (no dashboard, employee management or "view as"). Authorized as an
//              employee in the DB (migration 0042). NEVER NAS/SIN.
//   manager  — full dashboard
//   owner    — the company owner: manager-tier AND privileged (NAS/SIN reveal, role
//              assignment, the crown). Replaces the old hardcoded boss/dev ids so a fork
//              only has to mark one account `owner` in the DB — no source edit.
//
// Privilege is role-based (owner), matching is_privileged() in the database. These take a
// role string, not a user id, so nothing here is tied to a specific deployment.

// True for the company owner — the privileged tier (sensitive data, role assignment).
export function isOwnerRole(role) {
  return role === "owner";
}

// True when the role has manager-level access (manager or owner). `admin` is an office
// employee (non-manager) since migration 0042 — it is intentionally NOT included here.
export function isManagerRole(role) {
  return role === "manager" || role === "owner";
}

// True when the role is a non-CCQ administration (office) employee. Used to drive the
// simplified timesheet and the flat-hourly / non-CCQ treatment.
export function isAdminEmployee(role) {
  return role === "admin";
}

// True when the role is NOT a CCQ tradesperson: administration/office staff and the
// owner (management). These use the flat-hourly presentation and carry no CCQ export
// metadata (annexe, wage schedule, NAS, etc.).
export function isNonCcqRole(role) {
  return role === "admin" || role === "owner";
}

// True when the role may see sensitive data (NAS/SIN) and assign roles. Owner only.
export function isPrivileged(role) {
  return isOwnerRole(role);
}

// Management (Gestion) sections an owner may grant to an office (admin) employee,
// stored in profiles.admin_sections. The order here is the order they appear.
export const GRANTABLE_ADMIN_SECTIONS = ["live", "timesheet", "notifications", "employees", "forms"];

// True when the user may open the Gestion dashboard at all: any manager-tier role,
// or an admin the owner granted at least one section.
export function hasManagementAccess(role, adminSections) {
  if (isManagerRole(role)) return true;
  return isAdminEmployee(role) && Array.isArray(adminSections) && adminSections.length > 0;
}

// True when the user may open a specific Gestion section. Managers/owners see all;
// a granted admin sees only the sections the owner ticked.
export function canAccessSection(role, adminSections, sectionId) {
  if (isManagerRole(role)) return true;
  return isAdminEmployee(role) && Array.isArray(adminSections) && adminSections.includes(sectionId);
}
