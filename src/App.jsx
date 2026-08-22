// src/App.jsx
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import EmployeeForm from "./pages/EmployeeForm";
import History from "./pages/History";
import Week from "./pages/Week";
import ManagerDashboard from "./pages/ManagerDashboard";
import Testing from "./pages/Testing";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";

export default function App() {
  const isPasswordRecovery = window.location.pathname === "/reset-password";

  React.useEffect(() => {
    // If the user landed on a non-root path (e.g. /form from a stale bookmark),
    // collapse it to "/" so HashRouter takes over cleanly.
    const { pathname, hash, search } = window.location;
    if (pathname !== "/" && pathname !== "/reset-password" && !hash) {
      window.history.replaceState(null, "", `/${search}${hash}`);
    }
  }, []);

  // Supabase appends its recovery credentials to the URL hash. Keep this
  // pathname outside HashRouter so the credentials are not mistaken for a route.
  if (isPasswordRecovery) return <ResetPassword />;

  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Employee form (supports both "/" and "/form") */}
        <Route
          path="/"
          element={<Navigate to="/form" replace />}
        />
        <Route
          path="/form"
          element={
            <ProtectedRoute>
              <EmployeeForm />
            </ProtectedRoute>
          }
        />

        {/* History */}
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        {/* Week summary (employee + manager can access; manager will get employee dropdown) */}
        <Route
          path="/week"
          element={
            <ProtectedRoute>
              <Week />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Manager dashboard */}
        <Route
          path="/manager"
          element={
            <ProtectedRoute requireRole="manager">
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />

        {/* Testing (manager only) */}
        <Route
          path="/testing"
          element={
            <ProtectedRoute requireRole="manager">
              <Testing />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
