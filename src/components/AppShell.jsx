import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import NotificationsBell from "@/components/NotificationsBell";
import RegionOnboarding from "@/components/RegionOnboarding";
import BroadcastPopup from "@/components/BroadcastPopup";
import OfflineBanner from "@/components/OfflineBanner";
import { useViewMode } from "@/contexts/ViewModeContext";
import headerLight from "../../public/header-light.jpg";
import headerDark from "../../public/header-dark.jpg";

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

export default function AppShell({ children }) {
  const { role, signOut } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const { isViewMode, viewedEmployee } = useViewMode();

  async function handleLogout() {
    try {
      await signOut();
    } finally {
      navigate("/login");
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
      {!isViewMode && <RegionOnboarding />}
      {!isViewMode && <BroadcastPopup />}
      {isViewMode && (
        <div className="sticky top-0 z-50 border-b border-amber-500 bg-amber-300 px-3 py-2 text-amber-950 shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="text-sm font-bold">{t("viewMode.banner", { name: viewedEmployee.name })}</div>
            <Button size="sm" variant="outline" className="h-8 border-amber-700 bg-amber-50 text-amber-950 hover:bg-white" onClick={() => navigate("/manager?section=employees")}>
              {t("viewMode.return")}
            </Button>
          </div>
        </div>
      )}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30 dark:bg-[#151515]">
        {/* Top row: brand left, business name centered, controls right */}
        <div className="relative mx-auto flex max-w-6xl items-center gap-1.5 px-2 py-2 sm:min-h-20 sm:gap-3 sm:px-4 sm:py-3">
          <Link to={`/form${viewSuffix}`} className="shrink-0 text-base font-extrabold tracking-tight sm:text-lg">
            SparkLog
          </Link>

          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            <img src={headerLight} alt="Entreprise Électrique Messier Connexion Inc" className="h-16 w-auto rounded dark:hidden" />
            <img src={headerDark} alt="Entreprise Électrique Messier Connexion Inc" className="hidden h-16 w-auto rounded dark:block" />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-0">
            <NotificationsBell />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.location.reload()}
              title={t("nav.refresh")}
              aria-label={t("nav.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <ThemeToggle className="h-8 w-8" />
            <LanguageToggle className="h-8 w-8" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleLogout}
              title={t("nav.signOut")}
              aria-label={t("nav.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Second row: nav tabs */}
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:px-4 sm:pb-3">
          <NavItem to={`/form${viewSuffix}`}>{t("nav.form")}</NavItem>
          <NavItem to={`/history${viewSuffix}`}>{t("nav.history")}</NavItem>
          <NavItem to={`/week${viewSuffix}`}>{t("nav.week")}</NavItem>
          <NavItem to={`/profile${viewSuffix}`}>{t("nav.profile")}</NavItem>
          {role === "manager" && !isViewMode && <NavItem to="/manager">{t("nav.manager")}</NavItem>}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-2 py-2 sm:px-4 sm:py-4">{children}</main>
    </div>
  );
}
