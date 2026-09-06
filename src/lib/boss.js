// Company roles that sit on top of the base `manager` DB role. Both accounts below
// are managers in the database (so their normal access is unchanged); these ids just
// layer extra identity/capability on top — used for labels and for privileged gates
// such as sensitive-data (NAS) access.

// The company owner ("the boss"). She is a manager like the others but gets a distinct
// crown icon, is hidden from the crew board / timesheet filter by default (she can
// toggle herself back on from her own profile), and is a privileged sensitive-data viewer.
export const BOSS_ID = "38034202-cd04-4666-b7d0-3c24ae906afd";

// The developer / project owner. A manager with unrestricted access — never gated out
// of anything, including sensitive-data views.
export const DEV_ID = "5f834c60-532d-4c17-b77e-df257c5b66b3";

export function isBoss(id) {
  return id === BOSS_ID;
}

export function isDev(id) {
  return id === DEV_ID;
}

// Allowed to see sensitive data (e.g. NAS/SIN): the owner and the developer.
export function isPrivileged(id) {
  return isBoss(id) || isDev(id);
}
