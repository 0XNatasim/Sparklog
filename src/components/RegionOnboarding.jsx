import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
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
  const [profile, setProfile] = useState(null);

  // A CCQ card is needed when there is none on file, or the current one expires
  // within 30 days (so the employee re-uploads to renew the picture).
  function needsCcqCard(data) {
    if (!data?.ccq_card_path) return true;
    if (!data?.ccq_expiration_date) return false;
    return dayjs(data.ccq_expiration_date).diff(dayjs(), "day") <= 30;
  }

  useEffect(() => {
    if (!user?.id || role === "manager") return;
    supabase.from("profiles").select("work_region, union_association, ccq_number, ccq_expiration_date, birth_date, ccq_card_path").eq("id", user.id).single()
      .then(({ data, error: loadError }) => {
        if (loadError) return;
        setRegion(data?.work_region || "");
        setAssociation(data?.union_association || "");
        setProfile(data);
        if (!data?.work_region) {
          setStep("region");
          setOpen(true);
        } else if (!data?.union_association) {
          setStep("association");
          setOpen(true);
        } else if (needsCcqCard(data)) {
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
    else if (needsCcqCard(profile)) setStep("ccq");
    else setOpen(false);
    setSaving(false);
  }

  const titleKey = step === "region" ? "onboarding.region.title" : step === "association" ? "onboarding.union.title" : "onboarding.ccq.title";
  const descriptionKey = step === "region" ? "onboarding.region.description" : step === "association" ? "onboarding.union.description" : "onboarding.ccq.description";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
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
              {saving ? t("common.saving") : step === "region" ? t("common.next") : (needsCcqCard(profile) ? t("common.next") : t("common.save"))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
