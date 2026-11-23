import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { dictionaries } from "@/lib/i18n";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
const { groupPageViews, pageViewKey, pageViewLabel } = await import("./page-views");

const t = (key) => dictionaries.fr[key] || key;

describe("pageViewLabel", () => {
  it("names the page and its tab, and keeps an unknown name as it is", () => {
    expect(pageViewLabel("todo", "ocr", t)).toContain("OCR");
    expect(pageViewLabel("page-inconnue", "x", t)).toBe("page-inconnue › x");
    expect(pageViewLabel("page-inconnue", "", t)).toBe("page-inconnue");
  });
});

describe("groupPageViews", () => {
  it("groups by day and person, busiest page first, newest day first", () => {
    const groups = groupPageViews([
      { view_day: "2026-11-20", user_id: "a", page: "todo", tab: "ocr", views: 2 },
      { view_day: "2026-11-20", user_id: "a", page: "todo", tab: "todo", views: 5 },
      { view_day: "2026-11-21", user_id: "a", page: "live", tab: "", views: 1 },
      { view_day: "2026-11-20", user_id: "b", page: "live", tab: "", views: 3 },
    ]);
    expect(groups.map((g) => `${g.day}|${g.userId}|${g.total}`)).toEqual(["2026-11-21|a|1", "2026-11-20|a|7", "2026-11-20|b|3"]);
    expect(groups[1].entries.map((e) => e.tab)).toEqual(["todo", "ocr"]);
  });
  it("uses one key per page + tab", () => {
    expect(pageViewKey("todo", "ocr")).not.toBe(pageViewKey("todo", ""));
  });
});

describe("migration 0159", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261123100000_0159_manager_page_views.sql", import.meta.url), "utf8");
  it("lets only manager accounts log, only the owner read, and nobody write directly", () => {
    expect(sql).toMatch(/get_my_role\(\) <> 'manager'/);
    expect(sql).toMatch(/revoke all on public\.manager_page_views from anon, public, authenticated/);
    expect(sql).toMatch(/grant select on public\.manager_page_views to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)/);
    expect(sql).toMatch(/p\.role = 'owner'/);
    expect(sql).toMatch(/revoke all on function public\.log_manager_page_view\(text, text\) from public, anon/);
  });
});
