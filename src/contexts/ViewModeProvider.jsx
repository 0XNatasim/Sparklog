import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isManagerRole } from "@/lib/roles";
import { ViewModeContext } from "@/contexts/ViewModeContext";

export function ViewModeProvider({ children }) {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get("employee");
  const employeeName = searchParams.get("employeeName") || "";
  const value = useMemo(() => ({
    isViewMode: isManagerRole(role) && Boolean(employeeId),
    viewedEmployee: employeeId ? { id: employeeId, name: employeeName } : null,
  }), [employeeId, employeeName, role]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}
