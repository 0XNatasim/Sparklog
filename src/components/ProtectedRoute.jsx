import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role, loading, authError } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Loading…</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div style={{ padding: 24, textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
          Authentication service unreachable
        </div>
        <div style={{ color: "#444" }}>{authError}</div>
        <div style={{ color: "#666", marginTop: 8 }}>
          Check your Supabase URL/key env vars and network access, then refresh.
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireRole && role !== requireRole) return <Navigate to="/" replace />;

  return children;
}
