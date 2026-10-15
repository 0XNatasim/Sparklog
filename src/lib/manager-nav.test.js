import { describe, expect, it } from "vitest";
import { APPLICATION_ROLES, authorizationFor } from "./authorization-matrix";
import {
  MANAGER_NAV, MANAGER_NAV_ITEMS, MANAGER_NAV_V2_ITEMS, MANAGER_NAV_V3, V3_REPLACED, canOpenNavItem, findNavItem, firstAllowedPath,
  hubOf, legacySectionTarget, visibleManagerNav,
} from "./manager-nav";
import { GRANTABLE_ADMIN_SECTIONS } from "./roles";

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

describe("Gestion V3 menu", () => {
  const v3Ids = MANAGER_NAV_V3.flatMap((group) => group.items.map((item) => item.id));

  it("has five entries, each a page with tabs, the day's work first", () => {
    expect(MANAGER_NAV_V3.map((group) => group.id)).toEqual(["time", "pay", "team", "messages", "settings"]);
    expect(MANAGER_NAV_V3.every((group) => group.hub)).toBe(true);
    expect(new Set(v3Ids).size).toBe(v3Ids.length);
    expect(firstAllowedPath("owner", [], "v3")).toBe("todo");
    expect(firstAllowedPath("manager", [], "v3")).toBe("todo");
  });

  it("keeps every page once, except the duplicates replaced by the pay calculation", () => {
    const replaced = Object.keys(V3_REPLACED).map((path) => MANAGER_NAV_ITEMS.find((item) => item.path === path).id);
    expect(replaced.sort()).toEqual(["payroll-das", "reports-costs", "reports-downloads", "reports-period"]);
    expect([...v3Ids, ...replaced].sort()).toEqual(MANAGER_NAV_ITEMS.map((item) => item.id).sort());
    for (const target of Object.values(V3_REPLACED)) expect(v3Ids).toContain(findNavItem(target).id);
    // Every figure has one V3 home: week and month of « Paie et coûts ».
    expect(hubOf(MANAGER_NAV_V3, "payroll/week").id).toBe("pay");
    expect(hubOf(MANAGER_NAV_V3, "payroll/month").id).toBe("pay");
  });

  it("keeps each page's path and access rule (only the label may change)", () => {
    const base = new Map(MANAGER_NAV_ITEMS.map((item) => [item.id, item]));
    for (const item of MANAGER_NAV_V3.flatMap((group) => group.items)) {
      expect(item.path, item.id).toBe(base.get(item.id).path);
      expect(item.grant ?? null, item.id).toBe(base.get(item.id).grant ?? null);
      expect(Boolean(item.ownerOnly), item.id).toBe(Boolean(base.get(item.id).ownerOnly));
    }
  });

  it("never replaces a page an office admin can be granted", () => {
    for (const path of Object.keys(V3_REPLACED)) expect(findNavItem(path).grant ?? null, path).toBeNull();
  });

  it("gives a granted admin the same pages in V2 and V3, never the manager-only ones", () => {
    for (const section of GRANTABLE_ADMIN_SECTIONS) {
      expect(ids("admin", [section], "v3").sort(), section).toEqual(ids("admin", [section]).sort());
    }
    const menu = ids("admin", [...GRANTABLE_ADMIN_SECTIONS], "v3");
    expect(menu).not.toContain("todo");
    expect(menu).not.toContain("payroll-week");
    expect(firstAllowedPath("admin", ["live"], "v3")).toBe("live");
  });

  it("shows only the tabs a user may open, and hides an entry with none", () => {
    const admin = visibleManagerNav("admin", ["employees"], "v3");
    expect(admin.map((group) => group.id)).toEqual(["time", "team"]);
    expect(hubOf(admin, "unlock-day").items.map((item) => item.id)).toEqual(["unlock-day"]);
    expect(hubOf(admin, "payroll/week")).toBeNull();
  });

  it("names pages as the V3 menu shows them", () => {
    expect(findNavItem("receipts", "v3")?.labelKey).toBe("mgr.nav3.receipts");
    expect(findNavItem("receipts")?.labelKey).toBe("mgr.nav.receipts");
    expect(findNavItem("payroll/week")?.id).toBe("payroll-week");
    expect(findNavItem("payroll/month", "v3")?.labelKey).toBe("mgr.tab.month");
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
