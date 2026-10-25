import React, { useEffect, useState } from "react";
import { ThemeContext } from "@/components/theme-provider";

const STORAGE_KEY = "sparklog-theme";

// Browser/OS status-bar colour per mode; must match --background in index.css.
const THEME_COLORS = { light: "#ffffff", dark: "#151515" };

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  root.classList.add(resolved);
  // index.html ships one media-scoped tag per mode for first paint; once the app picks a
  // theme (possibly overriding the system one), both follow it.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute("media");
    meta.setAttribute("content", THEME_COLORS[resolved]);
  });
}

export function ThemeProvider({ children, defaultTheme = "system" }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return defaultTheme;
    return window.localStorage.getItem(STORAGE_KEY) || defaultTheme;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen to system changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = (t) => {
    window.localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}
