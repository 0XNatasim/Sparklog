import { createContext, useContext } from "react";

// A manager viewing the app as one employee (?employee=…), provided by ViewModeProvider
// (src/contexts/ViewModeProvider.jsx).
export const ViewModeContext = createContext({ isViewMode: false, viewedEmployee: null });

export function useViewMode() {
  return useContext(ViewModeContext);
}
