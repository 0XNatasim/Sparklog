import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "sparklog.managerViewMode";
const ViewModeContext = createContext(null);

function readStoredEmployee() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function ViewModeProvider({ children }) {
  const { role } = useAuth();
  const [viewedEmployee, setViewedEmployeeState] = useState(readStoredEmployee);

  useEffect(() => {
    if (role && role !== "manager") {
      sessionStorage.removeItem(STORAGE_KEY);
      setViewedEmployeeState(null);
    }
  }, [role]);

  const value = useMemo(() => ({
    viewedEmployee,
    isViewMode: role === "manager" && Boolean(viewedEmployee?.id),
    startViewMode(employee) {
      const next = employee ? { id: employee.id, name: employee.full_name || employee.email || "Employee" } : null;
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
      setViewedEmployeeState(next);
    },
    stopViewMode() {
      sessionStorage.removeItem(STORAGE_KEY);
      setViewedEmployeeState(null);
    },
  }), [role, viewedEmployee]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const value = useContext(ViewModeContext);
  if (!value) throw new Error("useViewMode must be used inside ViewModeProvider");
  return value;
}
