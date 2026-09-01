import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/use-t";

const TOGGLES = [
  { field: "ccq_card_enabled", labelKey: "capture.ccqCard", descKey: "capture.ccqCardDesc" },
  { field: "birth_date_enabled", labelKey: "capture.birthDate", descKey: "capture.birthDateDesc" },
  { field: "union_association_enabled", labelKey: "capture.union", descKey: "capture.unionDesc" },
];

export default function CaptureSettingsManager() {
  const t = useT();
  const [settings, setSettings] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase
      .from("company_capture_settings")
      .select("ccq_card_enabled, birth_date_enabled, union_association_enabled")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setSettings(data || {});
      });
  }, []);

  async function toggle(field, checked) {
    setSettings((current) => ({ ...current, [field]: checked }));
    const { error } = await supabase
      .from("company_capture_settings")
      .update({ [field]: checked, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) setErr(error.message);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="font-semibold">{t("capture.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("capture.description")}</p>
        </div>
        {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive dark:text-red-300">{err}</div>}
        <div className="space-y-2">
          {TOGGLES.map(({ field, labelKey, descKey }) => (
            <label key={field} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
              <span>
                <span className="block text-sm font-medium">{t(labelKey)}</span>
                <span className="block text-xs text-muted-foreground">{t(descKey)}</span>
              </span>
              <input
                type="checkbox"
                disabled={!settings}
                checked={Boolean(settings?.[field])}
                onChange={(event) => toggle(field, event.target.checked)}
                className="h-5 w-5 rounded border-input accent-primary"
              />
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
