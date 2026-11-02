import { useCallback } from "react";
import { useLanguage } from "@/components/language-provider";
import fr from "@/lib/i18n-fr";
import { getEnglish } from "@/lib/i18n-loader";

function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`
  );
}

// Stable per language, so components can pass `t` to memoized children and effects
// without re-rendering or re-running them on every parent render.
export function useT() {
  const { language, englishReady } = useLanguage();
  return useCallback((key, params) => {
    // French is the base: both dictionaries hold the same keys (locked by a test), so a key
    // missing from English falls back to French, never the other way round.
    const active = (language === "en" && getEnglish()) || fr;
    const raw = active[key] != null ? active[key] : fr[key] != null ? fr[key] : key;
    return interpolate(raw, params);
    // englishReady is not read inside: it re-creates `t` once the English chunk has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, englishReady]);
}
