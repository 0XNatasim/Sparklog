import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./contexts/AuthProvider.jsx";
import { ThemeProvider } from "./components/ThemeProvider.jsx";
import { LanguageProvider } from "./components/LanguageProvider.jsx";
import { ErrorBoundary, RootErrorFallback } from "./components/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary fallback={RootErrorFallback}>
      <ThemeProvider defaultTheme="system">
        <LanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Fade out the launch splash (installed PWA only) as soon as the app has painted its
// first frame — no fixed delay, so a crew member can start entering time right away.
// The 0.4s CSS fade keeps it from reading as a flicker.
(function hideSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  const remove = () => {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 450);
  };
  requestAnimationFrame(() => requestAnimationFrame(remove));
})();

// Pages load on demand. If a deploy removed the files this tab started with, the next
// page change fails to fetch its code: reload once to pick up the current version
// (drafts live in IndexedDB). The one-minute guard stops a reload loop when offline.
window.addEventListener("vite:preloadError", () => {
  const KEY = "sparklog.chunkReloadAt";
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60 * 1000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
});

// Auto-apply a new deploy — but never while the tab is in active use (that
// would reload mid-entry and lose a timesheet). Check for updates on focus and
// every few minutes; when a new version takes control, reload only once the
// tab is in the background, so the user sees the fresh build on their return.
(function autoUpdate() {
  if (!("serviceWorker" in navigator)) return;
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (document.visibilityState === "hidden") reload();
    else document.addEventListener("visibilitychange", () => { if (document.hidden) reload(); }, { once: true });
  });
  navigator.serviceWorker.ready.then((registration) => {
    const check = () => registration.update().catch(() => {});
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    setInterval(check, 5 * 60 * 1000);
  }).catch(() => {});
})();
