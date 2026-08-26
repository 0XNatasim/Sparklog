import React, { createContext, useContext, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ViewModeContext = createContext({ isViewMode: false, viewedEmployee: null });

export function ViewModeProvider({ children }) {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get("employee");
  const value = useMemo(() => ({
    isViewMode: role === "manager" && Boolean(employeeId),
    viewedEmployee: employeeId ? { id: employeeId } : null,
  }), [employeeId, role]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
