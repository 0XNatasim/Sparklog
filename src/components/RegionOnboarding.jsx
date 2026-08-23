import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { useT } from "@/lib/use-t";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

export default function RegionOnboarding() {
  const { user, role } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.id || role === "manager") return;
    supabase.from("profiles").select("work_region").eq("id", user.id).single().then(({ data, error: loadError }) => {
      if (!loadError && !data?.work_region) setOpen(true);
    });
  }, [role, user?.id]);

  async function save() {
    if (!region) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ work_region: region }).eq("id", user.id);
    if (updateError) setError(updateError.message);
    else setOpen(false);
    setSaving(false);
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("onboarding.region.title")}</DialogTitle>
          <DialogDescription>{t("onboarding.region.description")}</DialogDescription>
        </DialogHeader>
        <Select value={region} onChange={(event) => setRegion(event.target.value)}>
          <option value="">{t("onboarding.region.choose")}</option>
          {QUEBEC_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
        </Select>
        {error && <p className="text-sm text-destructive dark:text-red-300">{error}</p>}
        <DialogFooter><Button type="button" disabled={!region || saving} onClick={save}>{saving ? t("common.saving") : t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
