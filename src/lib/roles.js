// Role helpers. Roles are stored lowercase: 'employee', 'manager', 'admin'.
//
// `admin` (the administration / office role) is a manager-tier account: it reaches
// every manager screen, so the UI treats it like a manager everywhere EXCEPT
// sensitive-data (NAS/SIN) surfaces, which stay gated by isPrivileged() on explicit
// user ids (see src/lib/boss.js). The admin is never privileged, so those surfaces are
// hidden for them automatically and RLS blocks the underlying reads.

// True when the role has manager-level access (manager or admin). Use this anywhere a
// screen or action was previously gated on `role === "manager"`.
export function isManagerRole(role) {
  return role === "manager" || role === "admin";
}
