import { useEffect, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { findNavItem } from "@/lib/manager-nav";

// Which pages / tabs a manager opens each day (migration 0159). Only names are sent: the page (path after #/manager) and the tab.
// A visit counts once the manager stayed this long on the same page + tab (a tab corrected in the URL or a quick pass is not a visit).
export const PAGE_VIEW_DELAY_MS = 1500;

export function pageViewKey(page, tab) {
  return `${page || ""}|${tab || ""}`;
}

// « Feuille de temps › Entrées » from stored names; an unknown page or tab keeps its raw name.
export function pageViewLabel(page, tab, t) {
  const item = findNavItem(page);
  const pageLabel = item?.labelKey ? t(item.labelKey) : page;
  const tabLabelKey = tab ? item?.tabs?.find((entry) => entry.key === tab)?.labelKey : null;
  const tabLabel = tab ? (tabLabelKey ? t(tabLabelKey) : tab) : "";
  return tabLabel ? `${pageLabel} › ${tabLabel}` : pageLabel;
}

// Best effort: never blocks or breaks a page.
export function logPageView(page, tab = "") {
  return Promise.resolve(supabase.rpc("log_manager_page_view", { p_page: page, p_tab: tab })).catch(() => {});
}

export function useLogPageView(page, tab, enabled = true) {
  const last = useRef("");
  useEffect(() => {
    if (!enabled || !page) return undefined;
    const key = pageViewKey(page, tab);
    if (last.current === key) return undefined;
    const timer = setTimeout(() => {
      last.current = key;
      logPageView(page, tab);
    }, PAGE_VIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [page, tab, enabled]);
}

// Rows of manager_page_views → [{ day, userId, entries: [{ page, tab, views }], total }], newest day first, then the person's order.
export function groupPageViews(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = `${row.view_day}|${row.user_id}`;
    if (!byKey.has(key)) byKey.set(key, { day: row.view_day, userId: row.user_id, entries: [], total: 0 });
    const group = byKey.get(key);
    group.entries.push({ page: row.page, tab: row.tab || "", views: row.views });
    group.total += row.views;
  }
  return [...byKey.values()]
    .map((group) => ({ ...group, entries: group.entries.sort((a, b) => b.views - a.views || a.page.localeCompare(b.page)) }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.userId.localeCompare(b.userId));
}
