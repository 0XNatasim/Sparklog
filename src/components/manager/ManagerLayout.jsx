import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart3, BookOpen, Calculator, CalendarCheck, CalendarDays, ChevronDown, ClipboardList, Clock3, Coins,
  Contact, FileCheck, FileDown, FilePlus2, FileText, HeartPulse, History, Landmark, LayoutGrid, ListChecks, LogOut, Megaphone,
  Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Percent, Radio, Receipt, RefreshCw, Scale, ScrollText, Settings,
  ShieldAlert, ShieldCheck, StickyNote, SlidersHorizontal, Sun, UserCircle, Users, Wallet, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { fetchInventoryNegativeAlerts, groupInventoryNegativeAlerts, INVENTORY_ALERTS_EVENT } from "@/lib/inventory-alerts";
import { fetchPendingSignups, groupBadgeTotal, pendingSignupCount, SIGNUPS_EVENT } from "@/lib/signups";
import { dueCount, fetchOpenReminders, fetchUnreadReplies, msUntilNextReminder, NOTES_EVENT, unreadNoteCount } from "@/lib/notes";
import { ACCIDENT_EVENT, fetchOpenAccidentCount } from "@/lib/accidents";
import { fetchTodoCount, TODO_EVENT } from "@/lib/todo-count";
import { Badge } from "@/components/ui/badge";
import { APP_VERSION } from "@/lib/version";
import { canOpenNavItem, findNavItem, nestedTabs, resolveTab, tabPath, visibleManagerNav } from "@/lib/manager-nav";
import { SidebarTabsContext } from "@/components/manager/nav-context";
import { isManagerRole } from "@/lib/roles";
import ManagerBell from "@/components/manager/ManagerBell";
import RegionOnboarding from "@/components/RegionOnboarding";
import BroadcastPopup from "@/components/BroadcastPopup";
import OfflineBanner from "@/components/OfflineBanner";
import UpdateBanner from "@/components/UpdateBanner";
import PushPrompt from "@/components/PushPrompt";
import { PanelLoading } from "@/components/LazyLoading";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const COMPANY_NAME = "Messier Connexion";
const COLLAPSE_KEY = "sparklog.managerNavCollapsed";
const HIDDEN_KEY = "sparklog.managerNavHidden"; // desktop: menu folded away entirely

const ICONS = {
  todo: ListChecks,
  notes: StickyNote,
  accidents: ShieldAlert,
  "payroll-week": CalendarCheck,
  "v3-time": Clock3,
  "v3-pay-history": History,
  "v3-team": Users,
  "v3-reports": BarChart3,
  "v3-config": Settings,
  inventory: Package,
  live: Radio,
  messages: Megaphone,
  "advanced-audit": ScrollText,
  "advanced-health": HeartPulse,
  "advanced-emergency": FilePlus2,
};

// Icons of the tabs nested under a many-tab page (tab keys are unique across those pages).
const TAB_ICONS = {
  stubs: Receipt, das: Landmark, roe: FileCheck, calcul: Calculator,
  costs: Coins, period: CalendarDays, grid: LayoutGrid, ccq: FileDown,
  settings: Wrench, "ccq-rates": Percent, "pay-rules": Scale, forms: FileText, references: BookOpen, contacts: Contact,
};

const GROUP_ICONS = { payroll: Wallet, config: SlidersHorizontal, advanced: ShieldCheck };

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function storeFlag(key, on) {
  try { window.localStorage.setItem(key, on ? "1" : "0"); } catch { /* storage unavailable */ }
}

// Red count on a menu entry: jobs to approve on À traiter, open negative-stock notices on Inventaire,
// new sign-ups waiting for activation on Équipe › Employés, due reminders on Notes.
function SidebarNav({ groups, collapsed, activePath, onNavigate, badges }) {
  const t = useT();
  const { role, adminSections } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeGroup = groups.find((group) => group.items.some((item) => item.path === activePath))?.id;
  // Each group says whether it starts expanded; the current page's group is always open.
  const [open, setOpen] = useState(() => new Set([
    ...groups.filter((group) => group.open).map((group) => group.id),
    ...(activeGroup ? [activeGroup] : []),
  ]));

  // Moving to another group (menu, link, deep link) opens it (adjusted while rendering).
  const [openedFor, setOpenedFor] = useState(activeGroup);
  if (activeGroup !== openedFor) {
    setOpenedFor(activeGroup);
    if (activeGroup) setOpen((current) => (current.has(activeGroup) ? current : new Set(current).add(activeGroup)));
  }

  function toggle(id) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <nav aria-label={t("mgr.menu.label")} className="flex-1 space-y-1 overflow-y-auto p-2">
      {groups.map((group) => {
        const single = group.items.length === 1;
        const expanded = collapsed || single || open.has(group.id);
        const GroupIcon = GROUP_ICONS[group.id];
        return (
          <div key={group.id} className={cn(collapsed && "border-b pb-1 last:border-b-0")}>
            {!single && !collapsed && (
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {GroupIcon && <GroupIcon className="h-3.5 w-3.5" />}
                <span className="flex-1 text-left">{t(group.labelKey)}</span>
                {!expanded && groupBadgeTotal(group.items, badges) > 0 && (
                  <Badge variant="destructive" className="px-1.5 normal-case tracking-normal">{groupBadgeTotal(group.items, badges)}</Badge>
                )}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} />
              </button>
            )}
            {expanded && group.items.map((item) => {
              const Icon = ICONS[item.id] || Clock3;
              const label = t(item.labelKey);
              // Tabs of a many-tab page nest under its entry while it is the open page.
              const children = nestedTabs(item, role, adminSections);
              const activeTab = children.length ? resolveTab(item, role, adminSections, requestedTab) : null;
              const showChildren = item.path === activePath && children.length > 0;
              const link = (
                <NavLink
                  key={item.id}
                  to={`/manager/${item.path}`}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={({ isActive }) => {
                    const base = cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      collapsed && "justify-center",
                      !collapsed && !single && "ml-1",
                      // The open child carries the highlight; its parent stays bold only.
                      isActive ? (showChildren ? "font-semibold text-foreground" : "bg-primary/10 font-semibold text-primary") : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    );
                    return cn(base, badges?.[item.id] > 0 && "text-destructive");
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                  {badges?.[item.id] > 0 && (
                    <Badge variant="destructive" className={cn("ms-auto", collapsed && "ms-0 px-1.5")}>{badges[item.id]}</Badge>
                  )}
                </NavLink>
              );
              return (
                <React.Fragment key={item.id}>
                  {link}
                  {showChildren && (
                    <ul className={cn("mb-1 mt-0.5 space-y-0.5", collapsed ? "flex flex-col items-center" : "ml-[1.15rem] border-l pl-2")}>
                      {children.map((child) => {
                        const ChildIcon = TAB_ICONS[child.key] || Clock3;
                        const childLabel = t(child.labelKey);
                        const isCurrent = child.key === activeTab;
                        return (
                          <li key={child.key} className={cn(!collapsed && "min-w-0")}>
                            <Link
                              to={tabPath(item, child.key)}
                              onClick={onNavigate}
                              title={collapsed ? childLabel : undefined}
                              aria-label={collapsed ? childLabel : undefined}
                              aria-current={isCurrent ? "page" : undefined}
                              className={cn(
                                "flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9",
                                collapsed && "justify-center",
                                isCurrent ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              )}
                            >
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                              {!collapsed && <span className="break-words">{childLabel}</span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function AccountMenu() {
  const t = useT();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  async function handleLogout() {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  const mySpace = [
    ["/form", t("nav.form"), ClipboardList],
    ["/history", t("nav.history"), History],
    ["/week", t("nav.week"), CalendarDays],
    ["/profile", t("nav.profile"), UserCircle],
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="touch" aria-label={t("mgr.account.label")} title={t("mgr.account.label")}>
          <UserCircle className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mgr.account.mySpace")}</div>
        {mySpace.map(([to, label, Icon]) => (
          <DropdownMenuItem key={to} onSelect={() => navigate(to)} className="min-h-11 gap-2 sm:min-h-9">
            <Icon className="h-4 w-4" />{label}
          </DropdownMenuItem>
        ))}
        <div className="my-1 border-t" />
        <DropdownMenuItem
          onSelect={(event) => { event.preventDefault(); setTheme(theme === "dark" || (theme !== "light" && isDark) ? "light" : "dark"); }}
          className="min-h-11 gap-2 sm:min-h-9"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{t("mgr.account.theme")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => { event.preventDefault(); setLanguage(language === "fr" ? "en" : "fr"); }}
          className="min-h-11 gap-2 sm:min-h-9"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center text-[10px] font-bold">{language === "fr" ? "EN" : "FR"}</span>
          {language === "fr" ? "English" : "Français"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.location.reload()} className="min-h-11 gap-2 sm:min-h-9">
          <RefreshCw className="h-4 w-4" />{t("nav.refresh")}
        </DropdownMenuItem>
        <div className="my-1 border-t" />
        <DropdownMenuItem onSelect={handleLogout} className="min-h-11 gap-2 sm:min-h-9">
          <LogOut className="h-4 w-4" />{t("nav.signOut")}
        </DropdownMenuItem>
        <div className="px-2 py-1 font-mono text-xs text-muted-foreground">V{APP_VERSION}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Gestion shell: grouped sidebar (rail or full) on desktop, drawer on phones, compact header.
// Pages render in <Outlet/> at full width; forms cap their own width.
export default function ManagerLayout() {
  const t = useT();
  const { role, adminSections } = useAuth();
  const location = useLocation();
  const groups = useMemo(() => visibleManagerNav(role, adminSections), [role, adminSections]);
  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSE_KEY));
  const [navHidden, setNavHidden] = useState(() => readFlag(HIDDEN_KEY));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inventoryNegatives, setInventoryNegatives] = useState(0);
  const [pendingSignups, setPendingSignups] = useState(0);
  const [dueNotes, setDueNotes] = useState(0);
  const [repliedNotes, setRepliedNotes] = useState(0);
  const [todoCount, setTodoCount] = useState(0);
  const [openAccidents, setOpenAccidents] = useState(0);
  const badges = useMemo(() => ({
    todo: isManagerRole(role) ? todoCount : 0,
    inventory: isManagerRole(role) ? inventoryNegatives : 0,
    "v3-team": isManagerRole(role) ? pendingSignups : 0,
    notes: isManagerRole(role) ? dueNotes + repliedNotes : 0,
    accidents: isManagerRole(role) ? openAccidents : 0,
  }), [inventoryNegatives, pendingSignups, dueNotes, repliedNotes, todoCount, openAccidents, role]);

  const activePath = location.pathname.replace(/^\/manager\/?/, "").replace(/\/+$/, "");
  const current = findNavItem(activePath);

  // Another page closes the phone drawer (adjusted while rendering).
  const [drawerPath, setDrawerPath] = useState(location.pathname);
  if (drawerPath !== location.pathname) {
    setDrawerPath(location.pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Open negative-stock notices: one per employee and inventory day. A dismiss on the
  // Inventory page fires INVENTORY_ALERTS_EVENT so the badge drops without a reload.
  useEffect(() => {
    if (!isManagerRole(role)) return undefined;
    let cancelled = false;
    let generation = 0;
    async function loadAlerts() {
      const ticket = ++generation;
      try {
        const rows = await fetchInventoryNegativeAlerts();
        if (!cancelled && ticket === generation) setInventoryNegatives(groupInventoryNegativeAlerts(rows).length);
      } catch (error) {
        console.error("[inventory-alerts]", error);
      }
    }
    loadAlerts();
    window.addEventListener(INVENTORY_ALERTS_EVENT, loadAlerts);
    return () => {
      cancelled = true;
      window.removeEventListener(INVENTORY_ALERTS_EVENT, loadAlerts);
    };
  }, [role, location.pathname]);

  // New sign-ups waiting for activation (email validated). Activating someone in Employés fires
  // SIGNUPS_EVENT so the badge drops without a reload.
  useEffect(() => {
    if (!isManagerRole(role)) return undefined;
    let cancelled = false;
    let generation = 0;
    async function loadSignups() {
      const ticket = ++generation;
      try {
        const rows = await fetchPendingSignups();
        if (!cancelled && ticket === generation) setPendingSignups(pendingSignupCount(rows));
      } catch (error) {
        console.error("[pending-signups]", error);
      }
    }
    loadSignups();
    window.addEventListener(SIGNUPS_EVENT, loadSignups);
    return () => {
      cancelled = true;
      window.removeEventListener(SIGNUPS_EVENT, loadSignups);
    };
  }, [role, location.pathname]);

  // « À traiter »: submitted jobs waiting for approval, a count-only request on each page change
  // and whenever the À traiter page reloads its list (TODO_EVENT).
  useEffect(() => {
    if (!isManagerRole(role)) return undefined;
    let cancelled = false;
    let generation = 0;
    async function loadTodo() {
      const ticket = ++generation;
      try {
        const count = await fetchTodoCount();
        if (!cancelled && ticket === generation) setTodoCount(count);
      } catch (error) {
        console.error("[todo-count]", error);
      }
    }
    loadTodo();
    window.addEventListener(TODO_EVENT, loadTodo);
    return () => {
      cancelled = true;
      window.removeEventListener(TODO_EVENT, loadTodo);
    };
  }, [role, location.pathname]);

  // Open accident files (Registre d'accidents): a count-only request on each page change and after a save.
  useEffect(() => {
    if (!isManagerRole(role)) return undefined;
    let cancelled = false;
    let generation = 0;
    async function loadAccidents() {
      const ticket = ++generation;
      try {
        const count = await fetchOpenAccidentCount();
        if (!cancelled && ticket === generation) setOpenAccidents(count);
      } catch (error) {
        console.error("[accidents]", error);
      }
    }
    loadAccidents();
    window.addEventListener(ACCIDENT_EVENT, loadAccidents);
    return () => {
      cancelled = true;
      window.removeEventListener(ACCIDENT_EVENT, loadAccidents);
    };
  }, [role, location.pathname]);

  // My due reminders (Notes): counted now, and again when the next reminder comes due (a timer),
  // when the tab is shown again, and after any change on the Notes page (NOTES_EVENT). Shared notes with
  // replies I have not seen yet (0118) count too, checked again every 2 minutes while the tab is shown.
  useEffect(() => {
    if (!isManagerRole(role)) return undefined;
    let cancelled = false;
    let generation = 0;
    let timer = null;
    async function loadReplies() {
      if (document.hidden) return;
      try {
        const unread = await fetchUnreadReplies();
        if (!cancelled) setRepliedNotes(unreadNoteCount(unread));
      } catch (error) {
        console.error("[notes] replies", error);
      }
    }
    async function loadNotes() {
      loadReplies();
      const ticket = ++generation;
      try {
        const rows = await fetchOpenReminders();
        if (cancelled || ticket !== generation) return;
        const now = new Date();
        setDueNotes(dueCount(rows, now));
        clearTimeout(timer);
        const wait = msUntilNextReminder(rows, now);
        // At most 6 h: a long timer can drift while the computer sleeps.
        if (wait !== null) timer = setTimeout(loadNotes, Math.min(wait + 1000, 6 * 60 * 60 * 1000));
      } catch (error) {
        console.error("[notes]", error);
      }
    }
    const onVisible = () => { if (!document.hidden) loadNotes(); };
    loadNotes();
    const replyTimer = setInterval(loadReplies, 2 * 60 * 1000);
    window.addEventListener(NOTES_EVENT, loadNotes);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(replyTimer);
      window.removeEventListener(NOTES_EVENT, loadNotes);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [role]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      storeFlag(COLLAPSE_KEY, !value);
      return !value;
    });
  }

  // Header toggle (desktop): fold the whole menu away to give the page the full width, and back.
  function toggleNavHidden() {
    setNavHidden((value) => {
      storeFlag(HIDDEN_KEY, !value);
      return !value;
    });
  }

  // Same ids as canAccessSection: an ungranted page by URL goes back to the landing page.
  if (current && !canOpenNavItem(role, adminSections, current)) return <Navigate to="/manager" replace />;

  return (
    <SidebarTabsContext.Provider value={!navHidden}>
    <div className="min-h-screen bg-background text-foreground">
      <OfflineBanner />
      <UpdateBanner />
      <PushPrompt />
      <RegionOnboarding />
      <BroadcastPopup />
      <div className="flex min-h-screen">
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card", !navHidden && "md:flex", collapsed ? "w-14" : "w-60")}>
          <div className={cn("flex h-12 shrink-0 items-center border-b px-3", collapsed && "justify-center px-0")}>
            <Link to="/manager" className="flex items-baseline gap-1 font-extrabold tracking-tight">
              {collapsed ? "S" : <>SparkLog<span className="font-mono text-xs font-normal text-muted-foreground">V{APP_VERSION}</span></>}
            </Link>
          </div>
          <SidebarNav groups={groups} collapsed={collapsed} activePath={activePath} badges={badges} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t(collapsed ? "mgr.menu.expand" : "mgr.menu.collapse")}
            title={t(collapsed ? "mgr.menu.expand" : "mgr.menu.collapse")}
            className="flex h-10 shrink-0 items-center justify-center gap-2 border-t text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" />{t("mgr.menu.collapse")}</>}
          </button>
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("mgr.menu.label")}>
            <button type="button" className="absolute inset-0 bg-black/50" aria-label={t("mgr.menu.close")} onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
              <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
                <span className="font-extrabold tracking-tight">SparkLog</span>
                <Button variant="ghost" size="touch" autoFocus onClick={() => setDrawerOpen(false)} aria-label={t("mgr.menu.close")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SidebarNav
                groups={groups}
                collapsed={false}
                activePath={activePath}
                badges={badges}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur sm:px-4">
            <Button variant="ghost" size="sm" className="h-11 gap-1.5 px-2 md:hidden" onClick={() => setDrawerOpen(true)} aria-label={t("mgr.menu.open")}>
              <Menu className="h-4 w-4" />{t("mgr.menu.button")}
            </Button>
            <Button
              variant="ghost"
              size="touch"
              className="hidden shrink-0 md:inline-flex"
              onClick={toggleNavHidden}
              aria-expanded={!navHidden}
              aria-label={t(navHidden ? "mgr.menu.show" : "mgr.menu.hide")}
              title={t(navHidden ? "mgr.menu.show" : "mgr.menu.hide")}
            >
              {navHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="hidden truncate text-xs leading-none text-muted-foreground sm:block">{COMPANY_NAME}</div>
              <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">{current ? t(current.labelKey) : t("nav.manager")}</h1>
            </div>
            {/* One bell: manager notifications + the person's own messages. */}
            <ManagerBell />
            <AccountMenu />
          </header>
          <main className="min-w-0 flex-1 px-2 py-3 sm:px-4 sm:py-4">
            {/* A crashing page keeps the sidebar, so the manager can move on. */}
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PanelLoading />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
    </SidebarTabsContext.Provider>
  );
}