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
