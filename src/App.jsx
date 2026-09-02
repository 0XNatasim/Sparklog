// src/App.jsx
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";

import Login from "./pages/Login";
import EmployeeForm from "./pages/EmployeeForm";
import History from "./pages/History";
import Week from "./pages/Week";
import ManagerDashboard from "./pages/ManagerDashboard";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import InstallPrompt from "@/components/InstallPrompt";

// Landing route: managers start on the Manager dashboard, employees on the form.
function RoleLanding() {
  const { role } = useAuth();
  // Role loads just after `loading` clears; wait for it so a manager is not
  // sent to /form before their role resolves.
  if (!role) return null;
  return <Navigate to={role === "manager" ? "/manager" : "/form"} replace />;
}

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
      <ViewModeProvider>
      <InstallPrompt />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Landing: managers → Manager dashboard, employees → form */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoleLanding />
            </ProtectedRoute>
          }
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

        {/* Preserve old manager bookmarks after moving Testing into Manager. */}
        <Route
          path="/testing"
          element={
            <ProtectedRoute requireRole="manager">
              <Navigate to="/manager?section=testing" replace />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ViewModeProvider>
    </HashRouter>
  );
}
