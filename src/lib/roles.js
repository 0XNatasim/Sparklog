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

// True when the role may see sensitive data (NAS/SIN) and assign roles. Owner only.
export function isPrivileged(role) {
  return isOwnerRole(role);
}
