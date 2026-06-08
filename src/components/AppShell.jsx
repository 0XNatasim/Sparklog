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

export default function AppShell({ title, children }) {
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link to="/form" className="text-lg font-extrabold tracking-tight">
              SparkLog
            </Link>
            {title && (
              <span className="text-sm font-semibold text-muted-foreground">{title}</span>
            )}
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            <NavItem to="/form">{t("nav.form")}</NavItem>
            <NavItem to="/history">{t("nav.history")}</NavItem>
            <NavItem to="/week">{t("nav.week")}</NavItem>
            {role === "manager" && <NavItem to="/manager">{t("nav.manager")}</NavItem>}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout} title={t("nav.signOut")} aria-label={t("nav.signOut")}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  );
}
