import { createContext, useContext } from "react";

// The signed-in account, provided by AuthProvider (src/contexts/AuthProvider.jsx).
export const AuthContext = createContext(null);
export const SESSION_RESUMED_EVENT = "sparklog:session-resumed";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
