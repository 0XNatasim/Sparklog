import React from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { useT } from "@/lib/use-t";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const target = language === "fr" ? "en" : "fr";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLanguage(target)}
      aria-label={t("nav.toggleLanguage")}
      title={t("nav.toggleLanguage")}
    >
      <Languages className="h-4 w-4" />
    </Button>
  );
}
