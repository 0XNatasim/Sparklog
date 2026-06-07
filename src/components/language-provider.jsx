import React, { createContext, useContext, useEffect, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/en";
import "dayjs/locale/fr";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";

const LanguageContext = createContext({ language: "en", setLanguage: () => {} });

const STORAGE_KEY = "language";

function detectInitial() {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) return stored;
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav && nav.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(detectInitial);

  useEffect(() => {
    dayjs.locale(language);
  }, [language]);

  const setLanguage = (lang) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
