// Role helpers. Roles are stored lowercase: 'employee', 'manager', 'admin', 'owner'.
//
// Tiers:
//   employee — the crew
//   manager  — full dashboard
//   admin    — administration/office: manager-tier access, non-CCQ pay, but NEVER NAS/SIN
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

// True when the role has manager-level access (manager, admin or owner). Use anywhere a
// screen or action was previously gated on `role === "manager"`.
export function isManagerRole(role) {
  return role === "manager" || role === "admin" || role === "owner";
}

// True when the role may see sensitive data (NAS/SIN) and assign roles. Owner only.
export function isPrivileged(role) {
  return isOwnerRole(role);
}
