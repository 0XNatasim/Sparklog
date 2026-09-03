import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { ThemeProvider } from "./components/theme-provider.jsx";
import { LanguageProvider } from "./components/language-provider.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system">
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Fade out the launch splash (installed PWA only) once the app has painted.
// Kept up briefly so it reads as a launch screen rather than a flicker.
(function hideSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  const remove = () => {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 450);
  };
  setTimeout(remove, 1000);
})();

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
