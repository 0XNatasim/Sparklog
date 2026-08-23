import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { UNION_ASSOCIATIONS } from "@/lib/union-associations";
import { useT } from "@/lib/use-t";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

export default function RegionOnboarding() {
  const { user, role } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState("");
  const [association, setAssociation] = useState("");
  const [step, setStep] = useState("region");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.id || role === "manager") return;
    supabase.from("profiles").select("work_region, union_association").eq("id", user.id).single().then(({ data, error: loadError }) => {
      if (loadError) return;
      setRegion(data?.work_region || "");
      setAssociation(data?.union_association || "");
      if (!data?.work_region) {
        setStep("region");
        setOpen(true);
      } else if (!data?.union_association) {
        setStep("association");
        setOpen(true);
      }
    });
  }, [role, user?.id]);

  async function saveRegion() {
    if (!region) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ work_region: region }).eq("id", user.id);
    if (updateError) setError(updateError.message);
    else setStep("association");
    setSaving(false);
  }

  async function saveAssociation() {
    if (!association) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ union_association: association }).eq("id", user.id);
    if (updateError) setError(updateError.message);
    else setOpen(false);
    setSaving(false);
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t(step === "region" ? "onboarding.region.title" : "onboarding.union.title")}</DialogTitle>
          <DialogDescription>{t(step === "region" ? "onboarding.region.description" : "onboarding.union.description")}</DialogDescription>
        </DialogHeader>
        {step === "region" ? (
          <Select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">{t("onboarding.region.choose")}</option>
            {QUEBEC_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
          </Select>
        ) : (
          <Select value={association} onChange={(event) => setAssociation(event.target.value)}>
            <option value="">{t("onboarding.union.choose")}</option>
            {UNION_ASSOCIATIONS.map((item) => <option key={item.code} value={item.code}>{item.employeeLabel}</option>)}
          </Select>
        )}
        {error && <p className="text-sm text-destructive dark:text-red-300">{error}</p>}
        <DialogFooter><Button type="button" disabled={(step === "region" ? !region : !association) || saving} onClick={step === "region" ? saveRegion : saveAssociation}>{saving ? t("common.saving") : step === "region" ? t("common.next") : t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
