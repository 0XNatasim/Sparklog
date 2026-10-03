// src/App.jsx
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";

import Login from "./pages/Login";
import EmployeeForm from "./pages/EmployeeForm";
import History from "./pages/History";
import Week from "./pages/Week";
import ManagerLayout from "./components/manager/ManagerLayout";
import {
  AbsencesPage, AuditPage, CcqPage, CostsPage, DownloadsPage, EmployeesPage, FormsPage, HealthPage, LivePage,
  ManagerIndex, MessagesPage, PayrollCalculPage, PayrollDasPage, PayrollRoePage, PayrollStubsPage, PeriodPage,
  ReceiptsPage, RulesPage, SettingsPage, TimesheetsPage,
} from "./pages/manager/ManagerPages";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { isManagerRole } from "@/lib/roles";
import InstallPrompt from "@/components/InstallPrompt";

// Landing route: managers/owners start on the Manager dashboard; employees — including
// administration (office) staff, who are non-manager employees — start on the form.
function RoleLanding() {
  const { role } = useAuth();
  // Role loads just after `loading` clears; wait for it so a manager is not
  // sent to /form before their role resolves.
  if (!role) return null;
  return <Navigate to={isManagerRole(role) ? "/manager" : "/form"} replace />;
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

        {/* Gestion: sidebar layout; every page has its own URL (#/manager/…). The layout
            itself re-checks each page against canAccessSection. */}
        <Route
          path="/manager"
          element={
            <ProtectedRoute requireRole="manager">
              <ManagerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ManagerIndex />} />
          <Route path="live" element={<LivePage />} />
          <Route path="timesheets" element={<TimesheetsPage />} />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="absences" element={<AbsencesPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="payroll" element={<Navigate to="calcul" replace />} />
          <Route path="payroll/calcul" element={<PayrollCalculPage />} />
          <Route path="payroll/stubs" element={<PayrollStubsPage />} />
          <Route path="payroll/das" element={<PayrollDasPage />} />
          <Route path="payroll/roe" element={<PayrollRoePage />} />
          <Route path="reports" element={<Navigate to="costs" replace />} />
          <Route path="reports/costs" element={<CostsPage />} />
          <Route path="reports/period" element={<PeriodPage />} />
          <Route path="reports/ccq" element={<CcqPage />} />
          <Route path="reports/downloads" element={<DownloadsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="config" element={<Navigate to="rules" replace />} />
          <Route path="config/rules" element={<RulesPage />} />
          <Route path="config/settings" element={<SettingsPage />} />
          <Route path="advanced" element={<Navigate to="audit" replace />} />
          <Route path="advanced/audit" element={<AuditPage />} />
          <Route path="advanced/health" element={<HealthPage />} />
          <Route path="*" element={<Navigate to="/manager" replace />} />
        </Route>

        {/* Preserve old manager bookmarks after moving Testing into Manager. */}
        <Route
          path="/testing"
          element={
            <ProtectedRoute requireRole="manager">
              <Navigate to="/manager/reports/costs" replace />
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
