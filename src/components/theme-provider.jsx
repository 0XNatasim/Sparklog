import { createContext, useContext } from "react";

// Light / dark / system theme, provided by ThemeProvider (src/components/ThemeProvider.jsx).
export const ThemeContext = createContext({ theme: "system", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}
