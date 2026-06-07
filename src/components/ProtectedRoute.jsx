import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role, loading, authError } = useAuth();

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

  if (requireRole && role !== requireRole) return <Navigate to="/" replace />;

  return children;
}
