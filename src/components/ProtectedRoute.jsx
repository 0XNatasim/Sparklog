import React from "react";
import { Navigate } from "react-router-dom";
import headerLight from "../../public/header-light.jpg";
import headerDark from "../../public/header-dark.jpg";
import { useAuth } from "../contexts/AuthContext";
import { hasManagementAccess, isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";

// A calm, branded full-screen status page (logo + message). Used for the
// "service unreachable" and "awaiting approval" states so a new employee always
// sees SparkLog, never a raw technical error.
function BrandedScreen({ title, children }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-4 text-center">
        <img src={headerLight} alt="SparkLog" className="mx-auto w-56 max-w-full rounded dark:hidden" />
        <img src={headerDark} alt="SparkLog" className="mx-auto hidden w-56 max-w-full dark:block" />
        <div className="text-xl font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role, isPaused, adminSections, loading, authError, signOut } = useAuth();
  const t = useT();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center p-6">
        <div className="text-lg font-bold">{t("common.loading")}</div>
      </div>
    );
  }

  if (authError) {
    return (
      <BrandedScreen title={t("auth.unreachable.title")}>
        <p className="text-muted-foreground">{t("auth.unreachable.body")}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t("auth.retry")}
        </button>
        <p className="text-[11px] text-muted-foreground/70">{authError}</p>
      </BrandedScreen>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isPaused && !isManagerRole(role)) {
    return (
      <BrandedScreen title={t("auth.paused.title")}>
        <p className="text-muted-foreground">{t("auth.paused.description")}</p>
        <button type="button" onClick={signOut} className="rounded-md border px-4 py-2 text-sm font-semibold">
          {t("nav.signOut")}
        </button>
      </BrandedScreen>
    );
  }

  // A "manager" requirement is satisfied by any manager-tier role (manager or owner),
  // and by an administration (office) employee the owner granted management access to
  // (they then see only the sections they were granted; enforced in ManagerDashboard).
  const meetsRole = requireRole === "manager" ? hasManagementAccess(role, adminSections) : role === requireRole;
  if (requireRole && !meetsRole) return <Navigate to="/" replace />;

  return children;
}
