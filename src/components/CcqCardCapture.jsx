import React, { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { extractTextFromImage, compressImage } from "@/lib/ocr";
import { parseCcqCard } from "@/lib/ccq-card";

// Employee-facing capture of the CCQ competency card. Fields save automatically:
// uploading a photo OCR-fills and saves them; editing a field saves on blur.
export default function CcqCardCapture({ userId, profile, onSaved }) {
  const t = useT();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [form, setForm] = useState({
    ccq_number: profile?.ccq_number || "",
    ccq_expiration_date: profile?.ccq_expiration_date || "",
    birth_date: profile?.birth_date || "",
  });

  async function persist(values, file) {
    let cardPath = profile?.ccq_card_path || null;
    if (file) {
      const blob = await compressImage(file);
      const path = `${userId}/card-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("ccq-cards").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      cardPath = path;
    }
    const { error } = await supabase.from("profiles").update({
      ccq_number: values.ccq_number.trim() || null,
      ccq_expiration_date: values.ccq_expiration_date || null,
      birth_date: values.birth_date || null,
      ccq_card_path: cardPath,
      ccq_card_captured_at: new Date().toISOString(),
      // New card/expiration re-arms the renewal reminders.
      ccq_renewal_60_sent_for: null,
      ccq_renewal_30_sent_for: null,
    }).eq("id", userId);
    if (error) throw error;
    onSaved?.();
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      const text = await extractTextFromImage(file);
      const parsed = parseCcqCard(text);
      const values = {
        ccq_number: parsed.ccqNumber || form.ccq_number,
        ccq_expiration_date: parsed.expiration || form.ccq_expiration_date,
        birth_date: parsed.birth || form.birth_date,
      };
      setForm(values);
      await persist(values, file);
      setInfo(t("ccqCard.saved"));
    } catch (e) {
      setErr(e?.message || t("ccqCard.readFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveField() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      await persist(form, null);
      setInfo(t("ccqCard.saved"));
    } catch (e) {
      setErr(e?.message || t("ccqCard.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ccqCard.number")}</span>
          <Input value={form.ccq_number} onChange={(e) => setForm((f) => ({ ...f, ccq_number: e.target.value }))} onBlur={saveField} className="h-9" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ccqCard.expiration")}</span>
          <Input type="date" value={form.ccq_expiration_date} onChange={(e) => setForm((f) => ({ ...f, ccq_expiration_date: e.target.value }))} onBlur={saveField} className="h-9" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ccqCard.birth")}</span>
          <Input type="date" value={form.birth_date} onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} onBlur={saveField} className="h-9" />
        </label>
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        {t("ccqCard.upload")}
      </Button>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive dark:text-red-300">{err}</div>}
      {info && <div className="text-sm text-emerald-700 dark:text-emerald-300">{info}</div>}
    </div>
  );
}
