import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/en";
import "dayjs/locale/fr";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { getEnglish, loadEnglish } from "@/lib/i18n-loader";
import { LanguageContext } from "@/components/language-provider";

const STORAGE_KEY = "language";

// French is the default (most employees use it); the phone's language is ignored so an
// English-configured phone doesn't flip the app to English. An explicit choice wins.
function detectInitial() {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) return stored;
  return "fr";
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(detectInitial);
  const [englishReady, setEnglishReady] = useState(Boolean(getEnglish()));

  // English is fetched on demand (separate chunk); French shows until it arrives.
  useEffect(() => {
    if (language !== "en" || englishReady) return undefined;
    let alive = true;
    loadEnglish().then(() => { if (alive) setEnglishReady(true); }).catch(() => {});
    return () => { alive = false; };
  }, [language, englishReady]);

  useEffect(() => {
    dayjs.locale(language);
    // Keep <html lang> in sync so the browser never mistakes the page for another
    // language and offers to auto-translate it.
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, englishReady }}>
      {children}
    </LanguageContext.Provider>
  );
}
