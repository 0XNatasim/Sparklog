import { describe, expect, it } from "vitest";
import { APPLICATION_ROLES, authorizationFor } from "./authorization-matrix";
import {
  MANAGER_NAV, MANAGER_NAV_ITEMS, MANAGER_NAV_V2_ITEMS, MANAGER_NAV_V3, canOpenNavItem, findNavItem, firstAllowedPath,
  legacySectionTarget, resolveTab, visibleManagerNav, visibleTabs,
} from "./manager-nav";
import { GRANTABLE_ADMIN_SECTIONS } from "./roles";

// Frozen copy of the V2 menu (ids, paths, labels, grants, owner-only, order). The V2 must not
// change: this literal is never edited to make a test pass.
const V2_MENU_LOCK = [
  { id: "today", labelKey: "mgr.group.today", items: [
    { id: "live", path: "live", grant: "live", labelKey: "mgr.nav.live" },
  ] },
  { id: "time", labelKey: "mgr.group.time", items: [
    { id: "timesheets", path: "timesheets", grant: "timesheet", labelKey: "mgr.nav.timesheets" },
    { id: "receipts", path: "receipts", grant: "notifications", labelKey: "mgr.nav.receipts" },
    { id: "unlock-day", path: "unlock-day", grant: "employees", labelKey: "mgr.nav.unlockDay" },
  ] },
  { id: "team", labelKey: "mgr.group.team", items: [
    { id: "employees", path: "employees", grant: "employees", labelKey: "mgr.nav.employees" },
    { id: "absences", path: "absences", grant: null, labelKey: "mgr.nav.absences" },
    { id: "inventory", path: "inventory", grant: null, labelKey: "mgr.nav.inventory" },
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
    { id: "forms", path: "forms", grant: "forms", labelKey: "mgr.nav.forms" },
    { id: "references", path: "config/references", grant: null, labelKey: "mgr.nav.references" },
  ] },
  { id: "advanced", labelKey: "mgr.group.advanced", items: [
    { id: "advanced-audit", path: "advanced/audit", grant: null, labelKey: "mgr.nav.audit" },
    { id: "advanced-health", path: "advanced/health", grant: null, labelKey: "mgr.nav.health" },
    { id: "advanced-pay-rules", path: "advanced/pay-rules", grant: null, labelKey: "mgr.nav.payRules" },
    { id: "advanced-emergency", path: "advanced/emergency", grant: null, ownerOnly: true, labelKey: "mgr.nav.emergency" },
  ] },
];

const ids = (role, adminSections, version = "v2") => visibleManagerNav(role, adminSections, version).flatMap((g) => g.items.map((i) => i.id));

describe("manager navigation", () => {
  it("has unique ids and paths", () => {
    expect(new Set(MANAGER_NAV_ITEMS.map((i) => i.id)).size).toBe(MANAGER_NAV_ITEMS.length);
    expect(new Set(MANAGER_NAV_ITEMS.map((i) => i.path)).size).toBe(MANAGER_NAV_ITEMS.length);
  });

  it("shows every V2 page to the owner, starting on the live crew", () => {
    expect(ids("owner", [])).toHaveLength(MANAGER_NAV_V2_ITEMS.length);
    expect(firstAllowedPath("owner", [])).toBe("live");
  });

  it("shows every page except the owner-only ones to a manager", () => {
    const ownerOnly = MANAGER_NAV_ITEMS.filter((item) => item.ownerOnly).map((item) => item.id);
    expect(ownerOnly).toEqual(["advanced-emergency"]);
    expect(ids("manager", [])).toHaveLength(MANAGER_NAV_V2_ITEMS.length - ownerOnly.length);
    for (const id of ownerOnly) expect(ids("manager", [])).not.toContain(id);
    expect(firstAllowedPath("manager", [])).toBe("live");
  });

  it("keeps the emergency timesheet owner-only, whatever an admin was granted", () => {
    for (const role of ["employee", "subcontractor_1", "admin", "manager"]) {
      expect(ids(role, [...GRANTABLE_ADMIN_SECTIONS]), role).not.toContain("advanced-emergency");
    }
    expect(ids("owner", [])).toContain("advanced-emergency");
  });

  it.each(["employee", "subcontractor_1", "admin"])("shows nothing to %s without a grant", (role) => {
    expect(ids(role, [])).toEqual([]);
    expect(firstAllowedPath(role, [])).toBeNull();
  });

  it("never exposes payroll, reports, settings or audit to a granted admin", () => {
    const menu = ids("admin", [...GRANTABLE_ADMIN_SECTIONS]);
    for (const id of menu) {
      expect(id).not.toMatch(/^(payroll|reports|advanced|config-settings)/);
    }
    expect(menu).toEqual(expect.arrayContaining(["live", "timesheets", "receipts", "unlock-day", "employees", "forms", "messages", "config-rules"]));
    expect(menu).not.toContain("absences");
  });

  it("groups Inventory under Team and Forms under Configuration, next to Settings", () => {
    const groupOf = (id) => MANAGER_NAV.find((group) => group.items.some((item) => item.id === id))?.id;
    expect(groupOf("inventory")).toBe("team");
    expect(groupOf("forms")).toBe("config");
    const config = MANAGER_NAV.find((group) => group.id === "config").items.map((item) => item.id);
    expect(config.indexOf("forms")).toBe(config.indexOf("config-settings") + 1);
    expect(config.indexOf("references")).toBe(config.indexOf("forms") + 1);
  });

  it("keeps the references editor manager-only (never reachable through an admin grant)", () => {
    expect(ids("manager", [])).toContain("references");
    expect(ids("admin", [...GRANTABLE_ADMIN_SECTIONS])).not.toContain("references");
  });

  it("keeps the inventory screenshots page manager-only", () => {
    expect(ids("manager", [])).toContain("inventory");
    expect(ids("admin", [...GRANTABLE_ADMIN_SECTIONS])).not.toContain("inventory");
  });

  it("opens exactly the pages tied to one granted section", () => {
    expect(ids("admin", ["forms"])).toEqual(["forms"]);
    expect(ids("admin", ["notifications"])).toEqual(["receipts", "messages"]);
    expect(ids("admin", ["employees"])).toEqual(["unlock-day", "employees", "config-rules"]);
  });

  it("agrees with the authorization matrix for every role and grant", () => {
    for (const role of APPLICATION_ROLES) {
      for (const section of GRANTABLE_ADMIN_SECTIONS) {
        const permissions = authorizationFor({ role, adminSections: [section] });
        for (const item of MANAGER_NAV_ITEMS.filter((i) => i.grant === section)) {
          expect(canOpenNavItem(role, [section], item), `${role}:${item.id}`).toBe(permissions.managementSections[section]);
        }
      }
    }
  });

  it("finds items by path", () => {
    expect(findNavItem("/payroll/das/")?.id).toBe("payroll-das");
    expect(findNavItem("nope")).toBeNull();
  });
});

describe("V2 lock", () => {
  it("keeps the V2 menu exactly as it was", () => {
    expect(JSON.parse(JSON.stringify(MANAGER_NAV))).toEqual(V2_MENU_LOCK);
    expect(MANAGER_NAV_V2_ITEMS.every((item) => !item.tabs)).toBe(true);
  });
});

const ROLES = ["employee", "subcontractor_1", "manager", "owner"];
const ADMIN_GRANTS = [[], ...GRANTABLE_ADMIN_SECTIONS.map((s) => [s]), [...GRANTABLE_ADMIN_SECTIONS]];
const personas = [...ROLES.map((role) => [role, []]), ...ADMIN_GRANTS.map((grants) => ["admin", grants])];
const v3Entries = MANAGER_NAV_V3.flatMap((group) => group.items);
const sourceOf = (t) => (t.from ? MANAGER_NAV_ITEMS.find((item) => item.id === t.from) : t);

describe("Gestion V3 menu", () => {
  it("has 13 entries, each once, the day's work first", () => {
    const entryIds = v3Entries.map((item) => item.id);
    expect(entryIds).toHaveLength(13);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    expect(firstAllowedPath("owner", [], "v3")).toBe("todo");
    expect(firstAllowedPath("manager", [], "v3")).toBe("todo");
  });

  it("opens only Aujourd'hui and Paie by default", () => {
    expect(MANAGER_NAV_V3.filter((group) => group.open).map((group) => group.id)).toEqual(["today", "payroll"]);
  });

  it("reaches every V2 page in V3, as an entry or as a tab, exactly once (reports-period as 3 views)", () => {
    const reached = [
      ...v3Entries.filter((item) => !item.tabs).map((item) => item.id),
      ...v3Entries.flatMap((item) => (item.tabs || []).filter((t) => t.from).map((t) => t.from)),
    ];
    const unique = [...new Set(reached)];
    expect(unique.sort()).toEqual(MANAGER_NAV_V2_ITEMS.map((item) => item.id).concat("payroll-week").sort());
    expect(reached.filter((id) => id === "reports-period")).toHaveLength(3); // Semaine · Mois · Par employé
    expect(reached.length - unique.length).toBe(2);
  });

  it("gives every tab the access rule of the page it comes from, for every role and grant", () => {
    for (const [role, grants] of personas) {
      for (const entry of v3Entries) {
        for (const t of entry.tabs || []) {
          const expected = canOpenNavItem(role, grants, sourceOf(t));
          expect(visibleTabs(entry, role, grants).some((v) => v.key === t.key), `${role}[${grants}] ${entry.id}:${t.key}`).toBe(expected);
        }
        const anyTab = entry.tabs ? entry.tabs.some((t) => canOpenNavItem(role, grants, sourceOf(t))) : canOpenNavItem(role, grants, MANAGER_NAV_ITEMS.find((i) => i.id === entry.id));
        expect(canOpenNavItem(role, grants, entry), `${role}[${grants}] ${entry.id}`).toBe(anyTab);
      }
    }
  });

  it("lets a granted admin reach the same V2 pages in V3 (through entries or tabs), nothing more", () => {
    const reachableV3 = (grants) => visibleManagerNav("admin", grants, "v3").flatMap((group) => group.items).flatMap((item) => (
      item.tabs ? visibleTabs(item, "admin", grants).map((t) => t.from || `inline:${t.key}`) : [item.id]
    ));
    for (const grants of ADMIN_GRANTS) {
      expect([...new Set(reachableV3(grants))].sort(), String(grants)).toEqual(ids("admin", grants).sort());
    }
    expect(firstAllowedPath("admin", ["live"], "v3")).toBe("live");
    expect(firstAllowedPath("admin", ["notifications"], "v3")).toBe("todo"); // its Justificatifs tab
    expect(firstAllowedPath("admin", [], "v3")).toBeNull();
  });

  it("keeps the emergency timesheet owner-only and payroll, reports and settings manager-only", () => {
    const all = [...GRANTABLE_ADMIN_SECTIONS];
    expect(ids("admin", all, "v3")).not.toContain("advanced-emergency");
    expect(ids("manager", [], "v3")).not.toContain("advanced-emergency");
    expect(ids("owner", [], "v3")).toContain("advanced-emergency");
    for (const id of ["payroll-week", "v3-pay-history", "v3-reports", "advanced-audit", "advanced-health"]) {
      expect(ids("admin", all, "v3"), id).not.toContain(id);
    }
    expect(visibleTabs(MANAGER_NAV_ITEMS.find((i) => i.id === "v3-config"), "admin", all).map((t) => t.key)).toEqual(["time-rules", "forms"]);
  });

  it("falls back from a forbidden or unknown ?tab= to the first allowed tab, and to none without access", () => {
    const config = MANAGER_NAV_ITEMS.find((i) => i.id === "v3-config");
    expect(resolveTab(config, "manager", [], "references")).toBe("references");
    expect(resolveTab(config, "manager", [], "nope")).toBe("settings");
    expect(resolveTab(config, "admin", ["forms"], "settings")).toBe("forms");
    expect(resolveTab(config, "admin", ["live"], "forms")).toBeNull();
    const todo = MANAGER_NAV_ITEMS.find((i) => i.id === "todo");
    expect(resolveTab(todo, "admin", ["notifications"], "todo")).toBe("receipts");
    expect(resolveTab(todo, "employee", [], null)).toBeNull();
  });

  it("finds the V3 pages by path", () => {
    expect(findNavItem("v3/pay-history", "v3")?.id).toBe("v3-pay-history");
    expect(findNavItem("payroll/week")?.id).toBe("payroll-week");
  });
});

describe("legacy ?section= links", () => {
  it.each([
    ["?section=timesheet", "timesheets"],
    ["?section=employees", "employees"],
    ["?section=conges", "absences"],
    ["?section=settings", "config/settings"],
    ["?section=testing", "reports/costs"],
    ["?section=meals&job=abc", "receipts?job=abc&filter=meals"],
    ["?section=overtime&job=1", "receipts?job=1&filter=overtime"],
    ["?section=parking", "receipts?filter=parking"],
    ["?section=timesheet&job=9", "timesheets?job=9"],
  ])("%s → %s", (search, target) => {
    expect(legacySectionTarget(search)).toBe(target);
  });

  it("ignores unknown or missing sections", () => {
    expect(legacySectionTarget("")).toBeNull();
    expect(legacySectionTarget("?section=bogus")).toBeNull();
  });
});
