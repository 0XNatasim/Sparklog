// The company owner ("the boss"). She is a manager like the others but gets a
// distinct crown icon, and is hidden from the crew board and timesheet employee
// filter by default (she can toggle herself back on from her own profile).
export const BOSS_ID = "38034202-cd04-4666-b7d0-3c24ae906afd";

export function isBoss(id) {
  return id === BOSS_ID;
}
