// @vitest-environment jsdom
// A page with 4 tabs or more (Rapports, Configuration, Historique paie) also lists its tabs in the desktop
// sidebar, so it hides its own row of tabs there (md:hidden) while that sidebar is shown. A phone always
// keeps the row: its menu is a drawer, closed while the page is read (V2.4.189).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { dictionaries } from "@/lib/i18n";
import { SidebarTabsContext } from "@/components/manager/nav-context";

const state = vi.hoisted(() => ({ auth: { role: "owner", adminSections: [] } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
// The tab contents are not under test: each lazy panel renders a placeholder.
vi.mock("@/components/lazy-panel", () => ({ lazyPanel: () => function Panel() { return <div data-testid="panel" />; } }));

const { ReportsHubPage, TimeHubPage } = await import("./ManagerPages");

const fr = (key) => dictionaries.fr[key];

function show(Page, path, sidebarShown) {
  render(
    <SidebarTabsContext.Provider value={sidebarShown}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/manager/*" element={<Page />} /></Routes>
      </MemoryRouter>
    </SidebarTabsContext.Provider>,
  );
  return screen.getByRole("tablist");
}

afterEach(cleanup);

describe("row of tabs of a page with many tabs", () => {
  it("is hidden on desktop only while the sidebar lists the tabs, never on a phone", () => {
    const row = show(ReportsHubPage, "/manager/v3/reports?tab=period", true);
    expect(row.className).toContain("md:hidden");
    expect(row.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(row.className).not.toContain("max-md:hidden");
    expect(screen.getByRole("tab", { name: fr("mgr.nav3.tab.period") }).getAttribute("aria-selected")).toBe("true");
  });

  it("comes back on desktop when the menu is folded away", () => {
    const row = show(ReportsHubPage, "/manager/v3/reports?tab=costs", false);
    expect(row.className).not.toMatch(/hidden/);
  });

  it("stays for a page of 3 tabs or fewer", () => {
    const row = show(TimeHubPage, "/manager/v3/time?tab=timesheets", true);
    expect(row.className).not.toMatch(/hidden/);
  });
});

describe("Rapports › Semaine / Mois and Sommaire", () => {
  it("names the tabs Coûts, Semaine / Mois, Sommaire and Export CCQ", () => {
    show(ReportsHubPage, "/manager/v3/reports?tab=costs", true);
    expect(screen.getAllByRole("tab").map((el) => el.textContent))
      .toEqual([fr("mgr.nav.costs"), fr("mgr.nav3.tab.period"), "Sommaire", fr("mgr.nav3.tab.ccqExport")]);
    expect(screen.getByText(fr("mgr.reports.hint.costs"))).toBeTruthy();
  });

  it("switches between the week and the month view, kept in the URL", () => {
    show(ReportsHubPage, "/manager/v3/reports?tab=period", true);
    const week = screen.getByRole("radio", { name: fr("mgr.nav3.tab.week") });
    const month = screen.getByRole("radio", { name: fr("mgr.nav3.tab.month") });
    expect(week.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(month);
    expect(month.getAttribute("aria-checked")).toBe("true");
    expect(week.getAttribute("aria-checked")).toBe("false");
  });

  it("opens the month view for a former « Mois » link", async () => {
    show(ReportsHubPage, "/manager/v3/reports?tab=month", true);
    await waitFor(() => expect(screen.getByRole("radio", { name: fr("mgr.nav3.tab.month") }).getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByRole("tab", { name: fr("mgr.nav3.tab.period") }).getAttribute("aria-selected")).toBe("true");
  });
});
