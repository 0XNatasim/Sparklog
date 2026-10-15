// src/App.jsx
import React, { Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";

import Login from "./pages/Login";
import EmployeeForm from "./pages/EmployeeForm";
import { PageLoading } from "@/components/LazyLoading";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// The time-entry form (employees' landing page) and login stay in the main bundle;
// everything else loads on first visit. Manager code is never sent to employees.
const History = lazy(() => import("./pages/History"));
const Week = lazy(() => import("./pages/Week"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ManagerLayout = lazy(() => import("./components/manager/ManagerLayout"));
const managerPage = (name) => lazy(() => import("./pages/manager/ManagerPages").then((m) => ({ default: m[name] })));
const AbsencesPage = managerPage("AbsencesPage");
const AuditPage = managerPage("AuditPage");
const CcqPage = managerPage("CcqPage");
const CostsPage = managerPage("CostsPage");
const DownloadsPage = managerPage("DownloadsPage");
const EmployeesPage = managerPage("EmployeesPage");
const EmergencyPage = managerPage("EmergencyPage");
const FormsPage = managerPage("FormsPage");
const HealthPage = managerPage("HealthPage");
const PayRulesPage = managerPage("PayRulesPage");
const LivePage = managerPage("LivePage");
const TodoPage = managerPage("TodoPage");
const PayrollWeekPage = managerPage("PayrollWeekPage");
const PayrollMonthPage = managerPage("PayrollMonthPage");
const ReferencesPage = managerPage("ReferencesPage");
const ManagerIndex = managerPage("ManagerIndex");
const MessagesPage = managerPage("MessagesPage");
const PayrollCalculPage = managerPage("PayrollCalculPage");
const PayrollDasPage = managerPage("PayrollDasPage");
const PayrollRoePage = managerPage("PayrollRoePage");
const PayrollStubsPage = managerPage("PayrollStubsPage");
const PeriodPage = managerPage("PeriodPage");
const InventoryPage = managerPage("InventoryPage");
const ReceiptsPage = managerPage("ReceiptsPage");
const RulesPage = managerPage("RulesPage");
const UnlockDayPage = managerPage("UnlockDayPage");
const SettingsPage = managerPage("SettingsPage");
const TimesheetsPage = managerPage("TimesheetsPage");
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

// A crash on one page shows a recoverable error instead of a blank app; changing
// page clears it.
function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
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
  if (isPasswordRecovery) return <Suspense fallback={<PageLoading />}><ResetPassword /></Suspense>;

  return (
    <HashRouter>
      <ViewModeProvider>
      <InstallPrompt />
      <RouteErrorBoundary>
      <Suspense fallback={<PageLoading />}>
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
          <Route path="todo" element={<TodoPage />} />
          <Route path="timesheets" element={<TimesheetsPage />} />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="unlock-day" element={<UnlockDayPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="absences" element={<AbsencesPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="payroll" element={<Navigate to="calcul" replace />} />
          <Route path="payroll/week" element={<PayrollWeekPage />} />
          <Route path="payroll/month" element={<PayrollMonthPage />} />
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
          <Route path="config/references" element={<ReferencesPage />} />
          <Route path="advanced" element={<Navigate to="audit" replace />} />
          <Route path="advanced/audit" element={<AuditPage />} />
          <Route path="advanced/health" element={<HealthPage />} />
          <Route path="advanced/pay-rules" element={<PayRulesPage />} />
          <Route path="advanced/emergency" element={<EmergencyPage />} />
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
      </Suspense>
      </RouteErrorBoundary>
      </ViewModeProvider>
    </HashRouter>
  );
}
