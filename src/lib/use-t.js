import { useLanguage } from "@/components/language-provider";
import { dictionaries } from "@/lib/i18n";

function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`
  );
}

export function useT() {
  const { language } = useLanguage();
  return function t(key, params) {
    const active = dictionaries[language] || {};
    const en = dictionaries.en || {};
    const raw = active[key] != null ? active[key] : en[key] != null ? en[key] : key;
    return interpolate(raw, params);
  };
}
