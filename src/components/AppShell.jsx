import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-t";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      end={to === "/form"}
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

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        {/* Top row: brand left, business name centered, controls right */}
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/form" className="text-lg font-extrabold tracking-tight">
            SparkLog
          </Link>

          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-base font-bold tracking-tight">
            Messier Connexion
          </div>

          <div className="ml-auto flex items-center gap-0">
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
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 pb-3">
          <NavItem to="/form">{t("nav.form")}</NavItem>
          <NavItem to="/history">{t("nav.history")}</NavItem>
          <NavItem to="/week">{t("nav.week")}</NavItem>
          {role === "manager" && <NavItem to="/manager">{t("nav.manager")}</NavItem>}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  );
}
