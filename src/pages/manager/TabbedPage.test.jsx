// @vitest-environment jsdom
// A page with 4 tabs or more (Rapports, Configuration, Historique paie) also lists its tabs in the desktop
// sidebar, so it hides its own row of tabs there (md:hidden) while that sidebar is shown. A phone always
// keeps the row: its menu is a drawer, closed while the page is read (V2.4.189).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    const row = show(ReportsHubPage, "/manager/v3/reports?tab=week", true);
    expect(row.className).toContain("md:hidden");
    expect(row.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(row.className).not.toContain("max-md:hidden");
    expect(screen.getByRole("tab", { name: fr("mgr.nav3.tab.week") }).getAttribute("aria-selected")).toBe("true");
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
