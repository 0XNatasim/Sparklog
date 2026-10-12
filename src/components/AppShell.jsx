import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CalendarDays, ClipboardList, EllipsisVertical, History, Languages, LayoutDashboard, LogOut, Moon, RefreshCw, Sun, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { hasManagementAccess } from "@/lib/roles";
import { useT } from "@/lib/use-t";
import NotificationsBell from "@/components/NotificationsBell";
import RegionOnboarding from "@/components/RegionOnboarding";
import BroadcastPopup from "@/components/BroadcastPopup";
import OfflineBanner from "@/components/OfflineBanner";
import UpdateBanner from "@/components/UpdateBanner";
import EmployeeNotificationsBell from "@/components/EmployeeNotificationsBell";
import { useViewMode } from "@/contexts/ViewModeContext";
import { APP_VERSION } from "@/lib/version";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      end={to.startsWith("/form")}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
          isActive
            ? "bg-secondary text-foreground"
            : "text-primary hover:bg-accent hover:text-accent-foreground"
        )
      }
    >
      {children}
    </NavLink>
  );
}

// Phone only: four fixed destinations in thumb reach (field use, installed PWA).
// Labels stay 11px (tab-bar convention, icon carries the meaning) so "Fiche de travail" fits at 360px.
function BottomNavItem({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      end={to.startsWith("/form")}
      className={({ isActive }) =>
        cn(
          "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isActive ? "text-primary" : "text-muted-foreground"
        )
      }
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="max-w-full truncate">{children}</span>
    </NavLink>
  );
}

function PhoneMenu({ onSignOut }) {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const item = "min-h-11 gap-3 text-base";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="touch" className="sm:hidden" aria-label={t("mgr.account.label")} title={t("mgr.account.label")}>
          <EllipsisVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => window.location.reload()} className={item}>
          <RefreshCw className="h-5 w-5" />{t("nav.refresh")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => { event.preventDefault(); setTheme(theme === "dark" || (theme !== "light" && isDark) ? "light" : "dark"); }}
          className={item}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}{t("mgr.account.theme")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setLanguage(language === "fr" ? "en" : "fr"); }} className={item}>
          <Languages className="h-5 w-5" />{language === "fr" ? "English" : "Français"}
        </DropdownMenuItem>
        <div className="my-1 border-t" />
        <DropdownMenuItem onSelect={onSignOut} className={item}>
          <LogOut className="h-5 w-5" />{t("nav.signOut")}
        </DropdownMenuItem>
        <div className="px-2 py-1 font-mono text-xs text-muted-foreground">V{APP_VERSION}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppShell({ children }) {
  const { role, adminSections, signOut } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const { isViewMode, viewedEmployee } = useViewMode();
  const canManage = hasManagementAccess(role, adminSections);

  async function handleLogout() {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  // In view mode, keep the ?employee param on every tab so the manager stays
  // in the employee's view while browsing Job card / History / Week / Profile.
  const viewSuffix = isViewMode
    ? `?employee=${viewedEmployee.id}&employeeName=${encodeURIComponent(viewedEmployee.name || "")}`
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OfflineBanner />
      <UpdateBanner />
      {!isViewMode && <RegionOnboarding />}
      {!isViewMode && <BroadcastPopup />}
      {isViewMode && (
        <div className="sticky top-0 z-50 border-b border-warning bg-warning px-3 py-2 text-warning-foreground shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="text-sm font-bold">{t("viewMode.banner", { name: viewedEmployee.name })}</div>
            <Button size="sm" variant="outline" className="h-8 border-warning-foreground/40 bg-background text-foreground hover:bg-background/90" onClick={() => navigate("/manager/employees")}>
              {t("viewMode.return")}
            </Button>
          </div>
        </div>
      )}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        {/* Top row: brand left, business name centered, controls right */}
        <div className="relative mx-auto flex max-w-6xl items-center gap-1.5 px-2 py-2 sm:min-h-20 sm:gap-3 sm:px-4 sm:py-3">
          <Link to={`/form${viewSuffix}`} className="flex shrink-0 items-baseline gap-1 text-base font-extrabold tracking-tight sm:text-lg">
            SparkLog
            <span className="font-mono text-xs font-normal tracking-normal text-muted-foreground" title="Version">
              V{APP_VERSION}
            </span>
          </Link>

          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            <img src="/header-light.webp" alt="Entreprise Électrique Messier Connexion Inc" className="h-16 w-auto rounded dark:hidden" />
            <img src="/header-dark.webp" alt="Entreprise Électrique Messier Connexion Inc" className="hidden h-16 w-auto rounded dark:block" />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-0">
            {canManage && !isViewMode && (
              <Link to="/manager" className="mr-1 inline-flex h-11 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-accent sm:hidden" aria-label={t("nav.manager")}>
                <LayoutDashboard className="h-4 w-4" />{t("nav.manager")}
              </Link>
            )}
            <NotificationsBell />
            <EmployeeNotificationsBell />
            {/* Phones: one 44px menu instead of four small icons (and no accidental sign-out). */}
            <PhoneMenu onSignOut={handleLogout} />
            <div className="hidden items-center sm:flex">
              <Button
                variant="ghost"
                size="touch"
                onClick={() => window.location.reload()}
                title={t("nav.refresh")}
                aria-label={t("nav.refresh")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <ThemeToggle className="h-10 w-10" />
              <LanguageToggle className="h-10 w-10" />
              <Button
                variant="ghost"
                size="touch"
                onClick={handleLogout}
                title={t("nav.signOut")}
                aria-label={t("nav.signOut")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Second row: nav tabs */}
        <nav className="mx-auto hidden max-w-6xl items-center gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex sm:flex-wrap sm:px-4 sm:pb-3">
          <NavItem to={`/form${viewSuffix}`}>{t("nav.form")}</NavItem>
          <NavItem to={`/history${viewSuffix}`}>{t("nav.history")}</NavItem>
          <NavItem to={`/week${viewSuffix}`}>{t("nav.week")}</NavItem>
          <NavItem to={`/profile${viewSuffix}`}>{t("nav.profile")}</NavItem>
          {canManage && !isViewMode && <NavItem to="/manager">{t("nav.manager")}</NavItem>}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-2 py-2 pb-20 sm:px-4 sm:py-4 sm:pb-4">{children}</main>

      <nav
        aria-label={t("mgr.bottomNav.label")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <BottomNavItem to={`/form${viewSuffix}`} icon={ClipboardList}>{t("nav.form")}</BottomNavItem>
        <BottomNavItem to={`/history${viewSuffix}`} icon={History}>{t("nav.history")}</BottomNavItem>
        <BottomNavItem to={`/week${viewSuffix}`} icon={CalendarDays}>{t("nav.week")}</BottomNavItem>
        <BottomNavItem to={`/profile${viewSuffix}`} icon={UserCircle}>{t("nav.profile")}</BottomNavItem>
      </nav>
    </div>
  );
}
