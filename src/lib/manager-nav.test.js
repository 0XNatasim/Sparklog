import { describe, expect, it } from "vitest";
import { APPLICATION_ROLES, authorizationFor } from "./authorization-matrix";
import {
  MANAGER_NAV, MANAGER_NAV_ITEMS, MANAGER_PAGES, OLD_PATHS, canOpenNavItem, findNavItem, firstAllowedPath,
  hasNestedTabs, legacySectionTarget, nestedTabs, oldPathTarget, resolveTab, tabAlias, tabPath, visibleManagerNav, visibleTabs,
} from "./manager-nav";
import { GRANTABLE_ADMIN_SECTIONS } from "./roles";

const ids = (role, adminSections) => visibleManagerNav(role, adminSections).flatMap((g) => g.items.map((i) => i.id));
const entries = MANAGER_NAV.flatMap((group) => group.items);
const byId = (id) => MANAGER_NAV_ITEMS.find((item) => item.id === id);
const sourceOf = (t) => (t.from ? byId(t.from) : t);
const ROLES = ["employee", "subcontractor_1", "manager", "owner"];
const ADMIN_GRANTS = [[], ...GRANTABLE_ADMIN_SECTIONS.map((s) => [s]), [...GRANTABLE_ADMIN_SECTIONS]];
const personas = [...ROLES.map((role) => [role, []]), ...ADMIN_GRANTS.map((grants) => ["admin", grants])];

// Pages (and their rules) a person reaches through the menu: entries without tabs + allowed tabs.
const reachable = (role, grants) => visibleManagerNav(role, grants).flatMap((group) => group.items).flatMap((item) => (
  item.tabs ? visibleTabs(item, role, grants).map((t) => t.from || `inline:${t.key}`) : [item.id]
));

describe("Gestion menu", () => {
  it("has unique ids and paths", () => {
    expect(new Set(MANAGER_NAV_ITEMS.map((i) => i.id)).size).toBe(MANAGER_NAV_ITEMS.length);
    expect(new Set(MANAGER_NAV_ITEMS.map((i) => i.path)).size).toBe(MANAGER_NAV_ITEMS.length);
  });

  it("has 15 entries, each once, the day's work first", () => {
    const entryIds = entries.map((item) => item.id);
    expect(entryIds).toHaveLength(16);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    expect(firstAllowedPath("owner", [])).toBe("todo");
    expect(firstAllowedPath("manager", [])).toBe("todo");
  });

  it("opens only Aujourd'hui and Paie by default", () => {
    expect(MANAGER_NAV.filter((group) => group.open).map((group) => group.id)).toEqual(["today", "payroll"]);
  });

  it("reaches every page, as an entry or as a tab (reports-period, references, employees and the journal as 2)", () => {
    const reached = reachable("owner", []);
    const unique = [...new Set(reached)];
    expect(unique.filter((id) => !id.startsWith("inline:")).sort())
      .toEqual(MANAGER_PAGES.map((item) => item.id).concat("payroll-week", "advanced-travel-rules", "notes", "accidents").sort());
    expect(reached.filter((id) => id === "reports-period")).toHaveLength(2); // Semaine / Mois · Sommaire
    expect(reached.filter((id) => id === "references")).toHaveLength(2); // Références · Contacts (same rows)
    expect(reached.filter((id) => id === "employees")).toHaveLength(2); // Employés · Groupes (same rule, 0114)
    expect(reached.filter((id) => id === "advanced-audit")).toHaveLength(2); // Journal · Temps › Jours sans saisie
  });

  it("gives every tab the access rule of the page it comes from, for every role and grant", () => {
    for (const [role, grants] of personas) {
      for (const entry of entries) {
        for (const t of entry.tabs || []) {
          const expected = canOpenNavItem(role, grants, sourceOf(t));
          expect(visibleTabs(entry, role, grants).some((v) => v.key === t.key), `${role}[${grants}] ${entry.id}:${t.key}`).toBe(expected);
        }
        const anyTab = entry.tabs ? entry.tabs.some((t) => canOpenNavItem(role, grants, sourceOf(t))) : canOpenNavItem(role, grants, byId(entry.id));
        expect(canOpenNavItem(role, grants, entry), `${role}[${grants}] ${entry.id}`).toBe(anyTab);
      }
    }
  });

  it("lets a granted admin reach exactly the pages of their sections, nothing more", () => {
    for (const grants of ADMIN_GRANTS) {
      const expected = MANAGER_PAGES.filter((page) => canOpenNavItem("admin", grants, page)).map((page) => page.id).sort();
      expect([...new Set(reachable("admin", grants))].sort(), String(grants)).toEqual(expected);
    }
    expect([...new Set(reachable("admin", ["employees"]))].sort()).toEqual(["employees", "unlock-day"]);
    expect([...new Set(reachable("admin", ["notifications"]))].sort()).toEqual(["messages", "receipts"]);
    expect(firstAllowedPath("admin", ["live"])).toBe("live");
    expect(firstAllowedPath("admin", ["notifications"])).toBe("todo"); // its Justificatifs tab
    expect(firstAllowedPath("admin", [])).toBeNull();
  });

  it.each(["employee", "subcontractor_1", "admin"])("shows nothing to %s without a grant", (role) => {
    expect(ids(role, [])).toEqual([]);
    expect(firstAllowedPath(role, [])).toBeNull();
  });

  it("keeps the emergency timesheet owner-only and payroll, reports, settings and audit manager-only", () => {
    const all = [...GRANTABLE_ADMIN_SECTIONS];
    for (const role of ["employee", "subcontractor_1", "admin", "manager"]) expect(ids(role, all), role).not.toContain("advanced-emergency");
    expect(ids("owner", [])).toContain("advanced-emergency");
    for (const id of ["payroll-week", "v3-pay-history", "v3-reports", "advanced-audit", "advanced-health", "inventory", "notes", "accidents"]) {
      expect(ids("admin", all), id).not.toContain(id);
    }
    expect(visibleTabs(byId("v3-config"), "admin", all).map((t) => t.key)).toEqual(["forms"]);
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

  it("falls back from a forbidden or unknown ?tab= to the first allowed tab, and to none without access", () => {
    const config = byId("v3-config");
    expect(resolveTab(config, "manager", [], "references")).toBe("references");
    expect(resolveTab(config, "manager", [], "nope")).toBe("settings");
    expect(resolveTab(config, "admin", ["forms"], "settings")).toBe("forms");
    expect(resolveTab(config, "admin", ["live"], "forms")).toBeNull();
    const todo = byId("todo");
    expect(resolveTab(todo, "admin", ["notifications"], "todo")).toBe("receipts");
    expect(resolveTab(todo, "employee", [], null)).toBeNull();
  });

  it("opens Semaine / Mois for the former Semaine and Mois tabs (bookmarks, old links)", () => {
    const reports = byId("v3-reports");
    expect(resolveTab(reports, "manager", [], "week")).toBe("period");
    expect(resolveTab(reports, "manager", [], "month")).toBe("period");
    expect(tabAlias(reports, "month")).toEqual({ tab: "period", view: "month" });
    expect(tabAlias(reports, "costs")).toBeNull();
    expect(tabAlias(byId("v3-config"), "week")).toBeNull();
  });

  it("finds menu entries by path", () => {
    expect(findNavItem("/v3/pay-history/")?.id).toBe("v3-pay-history");
    expect(findNavItem("payroll/week")?.id).toBe("payroll-week");
    expect(findNavItem("payroll/das")).toBeNull(); // an old path: redirected, not a menu entry
    expect(findNavItem("nope")).toBeNull();
  });
});

describe("old paths (the V2 menu, removed in V2.4.186)", () => {
  const menuPaths = new Set(entries.map((item) => item.path));

  it("sends every former page to a menu entry, on a tab with the same access rule", () => {
    for (const page of MANAGER_PAGES) {
      if (menuPaths.has(page.path)) {
        expect(OLD_PATHS[page.path], page.path).toBeUndefined();
        continue;
      }
      const eq = OLD_PATHS[page.path];
      expect(eq, page.path).toBeTruthy();
      const entry = entries.find((item) => item.path === eq.path);
      const target = entry?.tabs?.find((t) => t.key === eq.tab);
      expect(target, page.path).toBeTruthy();
      expect(sourceOf(target).grant ?? null, page.path).toBe(page.grant ?? null);
    }
    for (const [path, eq] of Object.entries(OLD_PATHS)) {
      const entry = entries.find((item) => item.path === eq.path);
      expect(entry?.tabs?.some((t) => t.key === eq.tab), path).toBe(true);
    }
  });

  it("keeps the query of an old link", () => {
    expect(oldPathTarget("timesheets", "?emp=abc&date=2026-10-14")).toBe("v3/time?emp=abc&date=2026-10-14&tab=timesheets");
    expect(oldPathTarget("/payroll/stubs/", "")).toBe("v3/pay-history?tab=stubs");
    expect(oldPathTarget("config/references", "")).toBe("v3/config?tab=references");
    expect(oldPathTarget("config/rules", "")).toBe("v3/team?tab=employees");
    expect(oldPathTarget("receipts", "?filter=meals&job=9")).toBe("todo?filter=meals&job=9&tab=receipts");
    expect(oldPathTarget("reports/period", "?view=month")).toBe("v3/reports?view=month&tab=period");
    expect(oldPathTarget("reports/period", "?view=grid&week=2026-10-11")).toBe("v3/reports?week=2026-10-11&tab=grid");
    expect(oldPathTarget("reports/period", "")).toBe("v3/reports?tab=period");
    expect(oldPathTarget("reports/period", "?view=week")).toBe("v3/reports?tab=period");
    expect(oldPathTarget("payroll/das", "?method=book")).toBe("v3/pay-history?method=book&tab=das");
  });

  it("leaves current paths alone", () => {
    expect(oldPathTarget("live", "")).toBeNull();
    expect(oldPathTarget("v3/time", "?tab=timesheets")).toBeNull();
    expect(oldPathTarget("nope", "")).toBeNull();
  });
});

describe("legacy ?section= links", () => {
  it.each([
    ["?section=timesheet", "v3/time?tab=timesheets"],
    ["?section=employees", "v3/team?tab=employees"],
    ["?section=conges", "v3/team?tab=absences"],
    ["?section=settings", "v3/config?tab=settings"],
    ["?section=testing", "v3/reports?tab=costs"],
    ["?section=live", "live"],
    ["?section=meals&job=abc", "todo?job=abc&filter=meals&tab=receipts"],
    ["?section=overtime&job=1", "todo?job=1&filter=overtime&tab=receipts"],
    ["?section=parking", "todo?filter=parking&tab=receipts"],
    ["?section=timesheet&job=9", "v3/time?job=9&tab=timesheets"],
  ])("%s → %s", (search, target) => {
    expect(legacySectionTarget(search)).toBe(target);
  });

  it("ignores unknown or missing sections", () => {
    expect(legacySectionTarget("")).toBeNull();
    expect(legacySectionTarget("?section=bogus")).toBeNull();
  });
});

describe("tabs nested in the sidebar (4 tabs or more)", () => {
  it("nests exactly Rapports, Configuration and Historique paie", () => {
    expect(entries.filter(hasNestedTabs).map((i) => i.id)).toEqual(["v3-pay-history", "v3-reports", "v3-config"]);
  });

  it("lists, for a nested entry, the tabs the person may open, in order", () => {
    expect(nestedTabs(byId("v3-reports"), "manager", []).map((t) => t.key)).toEqual(["costs", "period", "grid", "ccq"]);
    expect(nestedTabs(byId("v3-config"), "owner", []).map((t) => t.key)).toEqual(visibleTabs(byId("v3-config"), "owner", []).map((t) => t.key));
    expect(nestedTabs(byId("v3-config"), "employee", [])).toEqual([]);
  });

  it("keeps horizontal tabs (no children) for pages of 3 tabs or fewer", () => {
    expect(nestedTabs(byId("v3-time"), "manager", [])).toEqual([]);
    expect(nestedTabs(byId("v3-team"), "manager", [])).toEqual([]);
  });

  it("links each child to its ?tab= and resolves it back", () => {
    for (const item of entries.filter(hasNestedTabs)) {
      for (const child of nestedTabs(item, "owner", [])) {
        const url = new URL(tabPath(item, child.key), "http://x");
        expect(url.pathname).toBe(`/manager/${item.path}`);
        expect(resolveTab(item, "owner", [], url.searchParams.get("tab"))).toBe(child.key);
      }
    }
  });
});
