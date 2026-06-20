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

export default function App() {
  React.useEffect(() => {
    // If the user landed on a non-root path (e.g. /form from a stale bookmark),
    // collapse it to "/" so HashRouter takes over cleanly.
    const { pathname, hash, search } = window.location;
    if (pathname !== "/" && !hash) {
      window.history.replaceState(null, "", `/${search}${hash}`);
    }
  }, []);

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