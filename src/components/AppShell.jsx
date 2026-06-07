import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

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
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

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
            <NavItem to="/form">Form</NavItem>
            <NavItem to="/history">History</NavItem>
            <NavItem to="/week">Week</NavItem>
            {role === "manager" && <NavItem to="/manager">Manager</NavItem>}

            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

            <ThemeToggle />

            <div className="hidden text-xs text-muted-foreground sm:block">
              <div className="font-medium text-foreground">{user?.email}</div>
              <div>role: {role}</div>
            </div>

            <Button variant="ghost" size="sm" onClick={handleLogout} title="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2 text-xs text-muted-foreground sm:hidden">
          {user?.email} • role: {role}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  );
}
