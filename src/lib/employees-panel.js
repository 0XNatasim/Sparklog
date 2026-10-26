// Gestion › Employés: the pure parts of the panel (order of the list, CCQ rate lookups, counters and
// filters), kept apart from the screen so they can be read and tested on their own.
import { isManagerRole, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import { COMMERCIAL_RATE_SECTOR, LEVEL_TO_SKILL, extractRateAnnexes, extractRegularHourlyRate } from "@/lib/ccq-rates";
import { getMissingEmployeeFields } from "@/lib/employee-fields";
import { DEPARTURE_STATUSES, NEW_HIRE, employeeStatus, isNewHire } from "@/lib/signups";

export const LEVELS = [
  { value: "compagnon",  label: "Compagnon" },
  { value: "apprenti_4", label: "Apprenti 4" },
  { value: "apprenti_3", label: "Apprenti 3" },
  { value: "apprenti_2", label: "Apprenti 2" },
  { value: "apprenti_1", label: "Apprenti 1" },
];

// Ordering of the employees list: owner first, then administration, then managers,
// then employees. Within each group the list stays alphabetical (paused sink last).
const ROLE_ORDER = { owner: 0, admin: 1, manager: 2, employee: 3, subcontractor_1: 4 };
const roleRank = (role) => (role in ROLE_ORDER ? ROLE_ORDER[role] : 4);

// Read-only display name for a role (used when the viewer may not reassign roles).
export function roleName(role, t) {
  if (role === "owner") return t("manager.bossLabel");
  if (role === "admin") return t("manager.adminLabel");
  if (role === "manager") return t("manager.roleLabel");
  if (role === "subcontractor_1") return t("manager.subcontractor1Label");
  return t("manager.employee");
}

// Group by role (owner → admin → manager → employee), keep alphabetical order within each group.
// Inside a group: new sign-ups first (to activate), then new hires waiting for their first day, then
// active accounts, then the other inactive ones.
export function sortEmployees(profiles, pending, today) {
  const rank = (p) => (isNewHire(p, today) ? 1 : !p.is_paused ? 2 : pending.has(p.id) ? 0 : 3);
  return [...(profiles ?? [])].sort((a, b) => {
    const byRole = roleRank(a.role) - roleRank(b.role);
    if (byRole !== 0) return byRole;
    const byState = rank(a) - rank(b);
    if (byState !== 0) return byState;
    return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", undefined, { sensitivity: "base" });
  });
}

// CCQ rate snapshots (newest first) → regular hourly rate per "sector:skill:annex" and the annexes of
// each sector. The first (newest) snapshot of a key wins.
export function ratesFromSnapshots(snapshots) {
  const rates = new Map();
  const annexes = new Map();
  (snapshots || []).forEach((snapshot) => {
    const available = extractRateAnnexes(snapshot.raw_json);
    if (!annexes.has(snapshot.sector_id)) annexes.set(snapshot.sector_id, available);
    available.forEach((annex) => {
      const key = `${snapshot.sector_id}:${snapshot.skill_id}:${annex.code}`;
      if (!rates.has(key)) rates.set(key, extractRegularHourlyRate(snapshot.raw_json, annex.code));
    });
  });
  return { rates, annexes };
}

// The annex an employee is paid on: theirs, else C3, else the first one published.
export function defaultAnnex(profile, annexes) {
  const available = annexes.get(COMMERCIAL_RATE_SECTOR) || [];
  return profile.wage_schedule || available.find((item) => item.code === "C3")?.code || available[0]?.code;
}

export function ccqRateFor(level, annex, rates) {
  return rates.get(`${COMMERCIAL_RATE_SECTOR}:${LEVEL_TO_SKILL[level]}:${annex}`);
}

// P-6: loading is READ-ONLY. Never write compensation as a side effect of a render. Instead compare
// each profile's stored rate with the current CCQ rate for its level/annex (dry run); the manager
// applies them explicitly. Only CCQ tradespeople follow the wage grid: owner/admin/manager and
// subcontractors have negotiated or flat rates, so their pay is never flagged.
export function rateSuggestionsFor(profiles, rates, annexes) {
  const suggestions = new Map();
  (profiles || []).forEach((profile) => {
    if (isNonCcqRole(profile.role) || isManagerRole(profile.role)) return;
    const annex = defaultAnnex(profile, annexes);
    const rate = ccqRateFor(profile.apprentice_level, annex, rates);
    if (rate == null || (Number(profile.hourly_rate) === rate && profile.wage_schedule === annex)) return;
    suggestions.set(profile.id, { rate, annex, current: profile.hourly_rate });
  });
  return suggestions;
}

// Active accounts whose phone has no notifications yet (the app asks them at every opening).
// `pushSet` null = unknown (the call failed): nobody is flagged.
export function lacksPush(profile, pushSet, pending, today) {
  return pushSet != null && !pushSet.has(profile.id) && employeeStatus(profile, pending, today) === "active";
}

// Counters of the header card. Three states: active, « En attente » (new hire before the first day)
// and inactive (paused); plus sign-ups, former employees, no notifications and missing CCQ fields.
export function employeeCounts(profiles, { pending, pushSet, today, t }) {
  const status = (p) => employeeStatus(p, pending, today);
  const count = (test) => (profiles || []).filter(test).length;
  return {
    active: count((p) => status(p) === "active"),
    inactive: count((p) => p.is_paused && status(p) !== NEW_HIRE),
    pending: count((p) => status(p) === "pending"),
    former: count((p) => DEPARTURE_STATUSES.includes(status(p))),
    [NEW_HIRE]: count((p) => isNewHire(p, today)),
    noPush: count((p) => lacksPush(p, pushSet, pending, today)),
    attention: count((p) => !p.is_paused && !isNonCcqRole(p.role) && getMissingEmployeeFields(p, t).length > 0),
  };
}

// The list under a counter filter: all · pending (with unconfirmed e-mails) · new_hire · former · noPush.
export function filterEmployees(profiles, filter, { pending, pushSet, today }) {
  return (profiles || []).filter((p) => {
    const status = employeeStatus(p, pending, today);
    if (filter === "noPush") return lacksPush(p, pushSet, pending, today);
    if (filter === "pending") return status === "pending" || status === "unconfirmed";
    if (filter === "former") return DEPARTURE_STATUSES.includes(status);
    if (filter === NEW_HIRE) return isNewHire(p, today);
    return true;
  });
}

// « Embauche / départ » (new hire, former employee): managers, never on the owner's or one's own card.
export function canSetEmployment(p, { role, user }) {
  return isManagerRole(role) && p.role !== "owner" && p.id !== user?.id;
}

// Tabs of the V3 employee card (Gestion V3 › Équipe › Employés), in order. CCQ: tradespeople and
// subcontractors. Impôts (TD1 / TP-1015.3, fixed pay, EI / QPP exemptions): manager-tier viewers only
// (employee_tax_profiles RLS), never for a subcontractor (no payroll deductions).
export const EMPLOYEE_CARD_TABS = Object.freeze(["identity", "ccq", "pay", "tax", "timeoff", "access"]);

export function employeeCardTabs(p, viewerRole) {
  return EMPLOYEE_CARD_TABS.filter((tab) => {
    if (tab === "ccq") return !isNonCcqRole(p.role) || isSubcontractorRole(p.role);
    if (tab === "tax") return isManagerRole(viewerRole) && !isSubcontractorRole(p.role);
    return true;
  });
}

// Search box of the V3 list: name, e-mail, phone (digits), employee number or CCQ number.
export function matchesEmployeeSearch(p, query) {
  const words = String(query || "").trim().toLocaleLowerCase("fr-CA").normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const plain = (value) => String(value || "").toLocaleLowerCase("fr-CA").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const haystack = [p.full_name, p.email, p.employee_number, p.ccq_number].map(plain).join(" ");
  const phone = String(p.phone || "").replace(/\D/g, "");
  return words.every((word) => haystack.includes(word) || (/^\d{3,}$/.test(word) && phone.includes(word)));
}
