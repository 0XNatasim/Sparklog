import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, User, Zap, ArrowRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/use-t";
import { visibleManagerNav, nestedTabs, tabPath } from "@/lib/manager-nav";
import { supabase } from "@/supabaseClient";

// Lightweight command palette (Cmd/Ctrl+K).
// Searches pages / tabs from the visible nav, common actions, and employees.
export default function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const { role, adminSections } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const groups = useMemo(() => visibleManagerNav(role, adminSections), [role, adminSections]);

  // Build flat list of navigable items (pages + nested tabs)
  const navItems = useMemo(() => {
    const items = [];
    for (const group of groups) {
      for (const item of group.items) {
        items.push({
          id: `page:${item.id}`,
          type: "page",
          label: t(item.labelKey),
          path: `/manager/${item.path}`,
          group: t(group.labelKey),
        });
        const children = nestedTabs(item, role, adminSections);
        for (const child of children) {
          items.push({
            id: `tab:${item.id}:${child.key}`,
            type: "tab",
            label: `${t(item.labelKey)} › ${t(child.labelKey)}`,
            path: tabPath(item, child.key),
            group: t(group.labelKey),
          });
        }
      }
    }
    return items;
  }, [groups, role, adminSections, t]);

  // Static actions (extend as needed)
  const actions = useMemo(() => [
    { id: "action:approve-week", type: "action", label: t("cmd.action.approveWeek"), path: "/manager/todo", keywords: "approuver semaine approve week" },
    { id: "action:export-ccq", type: "action", label: t("cmd.action.exportCcq"), path: "/manager/v3/reports?tab=ccq", keywords: "exporter ccq export" },
    { id: "action:payroll-week", type: "action", label: t("cmd.action.payrollWeek"), path: "/manager/payroll/week", keywords: "paie semaine payroll week" },
  ], [t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { pages: navItems.slice(0, 8), actions: actions.slice(0, 3), employees: [] };

    const match = (label, extra = "") =>
      label.toLowerCase().includes(q) || extra.toLowerCase().includes(q);

    return {
      pages: navItems.filter((item) => match(item.label, item.group)).slice(0, 10),
      actions: actions.filter((item) => match(item.label, item.keywords || "")).slice(0, 5),
      employees: employees.filter((e) => match(e.full_name || "", e.email || "")).slice(0, 8),
    };
  }, [query, navItems, actions, employees]);

  // Keyboard shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
      }
      if (e.key === "Escape" && open) { setOpen(false); setEmployees([]); }
    }
    window.addEventListener("keydown", onKey);
    const onOpen = () => { setOpen(true); setQuery(""); };
    window.addEventListener("sparklog:open-cmd", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sparklog:open-cmd", onOpen);
    };
  }, [open]);

  // Fetch employees when query is long enough
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for async search
    setLoadingEmployees(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(12);
        if (!cancelled) setEmployees(data || []);
      } catch (err) {
        console.error("[command-palette] employees", err);
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, query]);

  const go = useCallback((path) => {
    setOpen(false); setEmployees([]);
    setQuery("");
    navigate(path);
  }, [navigate]);

  const allResults = [
    ...filtered.actions.map((a) => ({ ...a, icon: Zap })),
    ...filtered.pages.map((p) => ({ ...p, icon: FileText })),
    ...filtered.employees.map((e) => ({
      id: `emp:${e.id}`,
      type: "employee",
      label: e.full_name || e.email || "—",
      path: `/manager/v3/team?tab=employees&search=${encodeURIComponent(e.full_name || e.email || "")}`,
      icon: User,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("cmd.placeholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1">
          {allResults.length === 0 && !loadingEmployees && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("cmd.empty")}
            </div>
          )}
          {loadingEmployees && query.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">{t("cmd.loading")}</div>
          )}
          {allResults.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.path)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.type === "action" && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">action</span>}
                <ArrowRight className="h-3.5 w-3.5 opacity-40" />
              </button>
            );
          })}
        </div>

        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          {t("cmd.hint")} · <kbd className="rounded border px-1">⌘K</kbd> / <kbd className="rounded border px-1">Ctrl+K</kbd>
        </div>
      </DialogContent>
    </Dialog>
  );
}
