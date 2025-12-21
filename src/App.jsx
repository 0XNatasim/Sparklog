import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import ElectricianForm from "./pages/ElectricianForm";
import History from "./pages/History";
import Week from "./pages/Week";
import ManagerDashboard from "./pages/ManagerDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Electrician default */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ElectricianForm />
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

        {/* Week summary (electrician + manager can access; manager will get employee dropdown) */}
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
