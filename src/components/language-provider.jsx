import { createContext, useContext } from "react";

// The app language (fr / en), provided by LanguageProvider (src/components/LanguageProvider.jsx).
export const LanguageContext = createContext({ language: "fr", setLanguage: () => {} });

export function useLanguage() {
  return useContext(LanguageContext);
}
