import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BadgeDollarSign, Banknote, BarChart3, CalendarClock, CalendarDays, CalendarOff, ChevronDown, ClipboardList,
  Clock3, FileText, Files, HeartPulse, History, LogOut, Megaphone, Menu, Moon, PanelLeftClose, PanelLeftOpen,
  Percent, Radio, Receipt, ReceiptText, RefreshCw, ScrollText, Settings, ShieldCheck, SlidersHorizontal, Sun,
  UserCircle, Users, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { APP_VERSION } from "@/lib/version";
import { canOpenNavItem, findNavItem, visibleManagerNav } from "@/lib/manager-nav";
import NotificationsBell from "@/components/NotificationsBell";
import EmployeeNotificationsBell from "@/components/EmployeeNotificationsBell";
import RegionOnboarding from "@/components/RegionOnboarding";
import BroadcastPopup from "@/components/BroadcastPopup";
import OfflineBanner from "@/components/OfflineBanner";
import UpdateBanner from "@/components/UpdateBanner";

const COMPANY_NAME = "Messier Connexion";
const COLLAPSE_KEY = "sparklog.managerNavCollapsed";

const ICONS = {
  live: Radio,
  timesheets: Clock3,
  receipts: Receipt,
  employees: Users,
  absences: CalendarOff,
  forms: ClipboardList,
  "payroll-calcul": Banknote,
  "payroll-stubs": ReceiptText,
  "payroll-das": Percent,
  "payroll-roe": FileText,
  "reports-costs": BadgeDollarSign,
  "reports-period": CalendarDays,
  "reports-ccq": BarChart3,
  "reports-downloads": Files,
  messages: Megaphone,
  "config-rules": CalendarClock,
  "config-settings": Settings,
  "advanced-audit": ScrollText,
  "advanced-health": HeartPulse,
};

const GROUP_ICONS = { payroll: Wallet, config: SlidersHorizontal, advanced: ShieldCheck };

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function SidebarNav({ groups, collapsed, activePath, onNavigate }) {
  const t = useT();
  const activeGroup = groups.find((group) => group.items.some((item) => item.path === activePath))?.id;
  const [open, setOpen] = useState(() => new Set(activeGroup ? [activeGroup] : []));

  // Moving to another group (menu, link, deep link) opens it.
  useEffect(() => {
    if (activeGroup) setOpen((current) => (current.has(activeGroup) ? current : new Set(current).add(activeGroup)));
  }, [activeGroup]);

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
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} />
              </button>
            )}
            {expanded && group.items.map((item) => {
              const Icon = ICONS[item.id] || Clock3;
              const label = t(item.labelKey);
              return (
                <NavLink
                  key={item.id}
                  to={`/manager/${item.path}`}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={({ isActive }) => cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed && "justify-center",
                    !collapsed && !single && "ml-1",
                    isActive ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </NavLink>
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
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("mgr.account.label")} title={t("mgr.account.label")}>
          <UserCircle className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("mgr.account.mySpace")}</div>
        {mySpace.map(([to, label, Icon]) => (
          <DropdownMenuItem key={to} onSelect={() => navigate(to)} className="gap-2">
            <Icon className="h-4 w-4" />{label}
          </DropdownMenuItem>
        ))}
        <div className="my-1 border-t" />
        <DropdownMenuItem
          onSelect={(event) => { event.preventDefault(); setTheme(theme === "dark" || (theme !== "light" && isDark) ? "light" : "dark"); }}
          className="gap-2"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{t("mgr.account.theme")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => { event.preventDefault(); setLanguage(language === "fr" ? "en" : "fr"); }}
          className="gap-2"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center text-[10px] font-bold">{language === "fr" ? "EN" : "FR"}</span>
          {language === "fr" ? "English" : "Français"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.location.reload()} className="gap-2">
          <RefreshCw className="h-4 w-4" />{t("nav.refresh")}
        </DropdownMenuItem>
        <div className="my-1 border-t" />
        <DropdownMenuItem onSelect={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />{t("nav.signOut")}
        </DropdownMenuItem>
        <div className="px-2 py-1 font-mono text-[10px] text-muted-foreground">V{APP_VERSION}</div>
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
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activePath = location.pathname.replace(/^\/manager\/?/, "").replace(/\/+$/, "");
  const current = findNavItem(activePath);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try { window.localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1"); } catch { /* storage unavailable */ }
      return !value;
    });
  }

  // Same ids as canAccessSection: an ungranted page by URL goes back to the landing page.
  if (current && !canOpenNavItem(role, adminSections, current)) return <Navigate to="/manager" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OfflineBanner />
      <UpdateBanner />
      <RegionOnboarding />
      <BroadcastPopup />
      <div className="flex min-h-screen">
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card md:flex", collapsed ? "w-14" : "w-60")}>
          <div className={cn("flex h-12 shrink-0 items-center border-b px-3", collapsed && "justify-center px-0")}>
            <Link to="/manager" className="flex items-baseline gap-1 font-extrabold tracking-tight">
              {collapsed ? "S" : <>SparkLog<span className="font-mono text-[10px] font-normal text-muted-foreground">V{APP_VERSION}</span></>}
            </Link>
          </div>
          <SidebarNav groups={groups} collapsed={collapsed} activePath={activePath} />
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
                <Button variant="ghost" size="icon" className="h-8 w-8" autoFocus onClick={() => setDrawerOpen(false)} aria-label={t("mgr.menu.close")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SidebarNav groups={groups} collapsed={false} activePath={activePath} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur sm:px-4 dark:bg-[#151515]">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 md:hidden" onClick={() => setDrawerOpen(true)} aria-label={t("mgr.menu.open")}>
              <Menu className="h-4 w-4" />{t("mgr.menu.button")}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="hidden truncate text-[11px] leading-none text-muted-foreground sm:block">{COMPANY_NAME}</div>
              <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">{current ? t(current.labelKey) : t("nav.manager")}</h1>
            </div>
            <NotificationsBell />
            <EmployeeNotificationsBell />
            <AccountMenu />
          </header>
          <main className="min-w-0 flex-1 px-2 py-3 sm:px-4 sm:py-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
