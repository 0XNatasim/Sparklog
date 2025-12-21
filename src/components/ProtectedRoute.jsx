import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireRole && role !== requireRole) return <Navigate to="/" replace />;

  return children;
}
