import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "@/lib/use-t";

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role, isPaused, loading, authError, signOut } = useAuth();
  const t = useT();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center p-6">
        <div className="text-lg font-bold">Loading…</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center p-6">
        <div className="max-w-xl text-center space-y-2">
          <div className="text-lg font-extrabold">Authentication service unreachable</div>
          <div className="text-muted-foreground">{authError}</div>
          <div className="text-sm text-muted-foreground">
            Check your Supabase URL/key env vars and network access, then refresh.
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isPaused && role !== "manager") {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md space-y-4 text-center">
          <div className="text-xl font-bold">{t("auth.paused.title")}</div>
          <p className="text-muted-foreground">{t("auth.paused.description")}</p>
          <button type="button" onClick={signOut} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{t("nav.signOut")}</button>
        </div>
      </div>
    );
  }

  if (requireRole && role !== requireRole) return <Navigate to="/" replace />;

  return children;
}
