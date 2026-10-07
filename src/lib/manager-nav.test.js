import { describe, expect, it } from "vitest";
import { APPLICATION_ROLES, authorizationFor } from "./authorization-matrix";
import {
  MANAGER_NAV_ITEMS, canOpenNavItem, findNavItem, firstAllowedPath, legacySectionTarget, visibleManagerNav,
} from "./manager-nav";
import { GRANTABLE_ADMIN_SECTIONS } from "./roles";

const ids = (role, adminSections) => visibleManagerNav(role, adminSections).flatMap((g) => g.items.map((i) => i.id));

describe("manager navigation", () => {
  it("has unique ids and paths", () => {
    expect(new Set(MANAGER_NAV_ITEMS.map((i) => i.id)).size).toBe(MANAGER_NAV_ITEMS.length);
    expect(new Set(MANAGER_NAV_ITEMS.map((i) => i.path)).size).toBe(MANAGER_NAV_ITEMS.length);
  });

  it.each(["manager", "owner"])("shows every page to %s, starting on the live crew", (role) => {
    expect(ids(role, [])).toHaveLength(MANAGER_NAV_ITEMS.length);
    expect(firstAllowedPath(role, [])).toBe("live");
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
    expect(menu).toEqual(expect.arrayContaining(["live", "timesheets", "receipts", "employees", "forms", "messages", "config-rules"]));
    expect(menu).not.toContain("absences");
  });

  it("keeps the inventory screenshots page manager-only", () => {
    expect(ids("manager", [])).toContain("inventory");
    expect(ids("admin", [...GRANTABLE_ADMIN_SECTIONS])).not.toContain("inventory");
  });

  it("opens exactly the pages tied to one granted section", () => {
    expect(ids("admin", ["forms"])).toEqual(["forms"]);
    expect(ids("admin", ["notifications"])).toEqual(["receipts", "messages"]);
    expect(ids("admin", ["employees"])).toEqual(["employees", "config-rules"]);
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
