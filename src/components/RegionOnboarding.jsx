import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { UNION_ASSOCIATIONS } from "@/lib/union-associations";
import { useT } from "@/lib/use-t";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import CcqCardCapture from "@/components/CcqCardCapture";

export default function RegionOnboarding() {
  const { user, role } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState("");
  const [association, setAssociation] = useState("");
  const [step, setStep] = useState("region");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ccqEnabled, setCcqEnabled] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user?.id || role === "manager") return;
    Promise.all([
      supabase.from("profiles").select("work_region, union_association, ccq_number, ccq_expiration_date, birth_date, ccq_card_path, ccq_card_capture_enabled").eq("id", user.id).single(),
      supabase.from("company_capture_settings").select("ccq_card_enabled").eq("id", true).maybeSingle(),
    ]).then(([{ data, error: loadError }, { data: settings }]) => {
      if (loadError) return;
      setRegion(data?.work_region || "");
      setAssociation(data?.union_association || "");
      setProfile(data);
      const effCcq = data?.ccq_card_capture_enabled ?? settings?.ccq_card_enabled ?? false;
      setCcqEnabled(effCcq);
      if (!data?.work_region) {
        setStep("region");
        setOpen(true);
      } else if (!data?.union_association) {
        setStep("association");
        setOpen(true);
      } else if (effCcq && !data?.ccq_card_path) {
        setStep("ccq");
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
    else if (ccqEnabled && !profile?.ccq_card_path) setStep("ccq");
    else setOpen(false);
    setSaving(false);
  }

  const titleKey = step === "region" ? "onboarding.region.title" : step === "association" ? "onboarding.union.title" : "onboarding.ccq.title";
  const descriptionKey = step === "region" ? "onboarding.region.description" : step === "association" ? "onboarding.union.description" : "onboarding.ccq.description";

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>
        {step === "region" && (
          <Select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">{t("onboarding.region.choose")}</option>
            {QUEBEC_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
          </Select>
        )}
        {step === "association" && (
          <Select value={association} onChange={(event) => setAssociation(event.target.value)}>
            <option value="">{t("onboarding.union.choose")}</option>
            {UNION_ASSOCIATIONS.map((item) => <option key={item.code} value={item.code}>{item.employeeLabel}</option>)}
          </Select>
        )}
        {step === "ccq" && (
          <CcqCardCapture userId={user.id} profile={profile} onSaved={() => setProfile((current) => ({ ...current, ccq_card_path: "pending" }))} />
        )}
        {error && <p className="text-sm text-destructive dark:text-red-300">{error}</p>}
        <DialogFooter>
          {step === "ccq" ? (
            <Button type="button" onClick={() => setOpen(false)}>{t("common.done")}</Button>
          ) : (
            <Button type="button" disabled={(step === "region" ? !region : !association) || saving} onClick={step === "region" ? saveRegion : saveAssociation}>
              {saving ? t("common.saving") : step === "region" ? t("common.next") : (ccqEnabled && !profile?.ccq_card_path ? t("common.next") : t("common.save"))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
