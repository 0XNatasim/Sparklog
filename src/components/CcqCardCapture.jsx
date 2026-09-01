import React, { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { extractTextFromImage, compressImage } from "@/lib/ocr";
import { parseCcqCard } from "@/lib/ccq-card";

// Employee-facing capture of the CCQ competency card: photo -> OCR autofill of
// number/expiration/birth date (editable) -> save image + fields to the profile.
export default function CcqCardCapture({ userId, profile, onSaved }) {
  const t = useT();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [form, setForm] = useState({
    ccq_number: profile?.ccq_number || "",
    ccq_expiration_date: profile?.ccq_expiration_date || "",
    birth_date: profile?.birth_date || "",
  });

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setErr("");
    setInfo("");
    setPendingFile(file);
    setBusy(true);
    try {
      const text = await extractTextFromImage(file);
      const parsed = parseCcqCard(text);
      setForm((current) => ({
        ccq_number: parsed.ccqNumber || current.ccq_number,
        ccq_expiration_date: parsed.expiration || current.ccq_expiration_date,
        birth_date: parsed.birth || current.birth_date,
      }));
      setInfo(t("ccqCard.readOk"));
    } catch {
      setErr(t("ccqCard.readFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      let cardPath = profile?.ccq_card_path || null;
      if (pendingFile) {
        const blob = await compressImage(pendingFile);
        const path = `${userId}/card-${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("ccq-cards").upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        cardPath = path;
      }
      const { error } = await supabase.from("profiles").update({
        ccq_number: form.ccq_number.trim() || null,
        ccq_expiration_date: form.ccq_expiration_date || null,
        birth_date: form.birth_date || null,
        ccq_card_path: cardPath,
        ccq_card_captured_at: new Date().toISOString(),
        // New card/expiration re-arms the renewal reminders.
        ccq_renewal_60_sent_for: null,
        ccq_renewal_30_sent_for: null,
      }).eq("id", userId);
      if (error) throw error;
      setPendingFile(null);
      setInfo(t("ccqCard.saved"));
      onSaved?.();
    } catch (e) {
      setErr(e?.message || t("ccqCard.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("ccqCard.description")}</p>
        {profile?.ccq_card_path && !pendingFile && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">{t("ccqCard.onFile")}</div>
        )}

        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {t("ccqCard.upload")}
        </Button>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ccqCard.number")}</span>
            <Input value={form.ccq_number} onChange={(e) => setForm((f) => ({ ...f, ccq_number: e.target.value }))} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ccqCard.expiration")}</span>
            <Input type="date" value={form.ccq_expiration_date} onChange={(e) => setForm((f) => ({ ...f, ccq_expiration_date: e.target.value }))} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ccqCard.birth")}</span>
            <Input type="date" value={form.birth_date} onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} className="h-9" />
          </label>
        </div>

        {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive dark:text-red-300">{err}</div>}
        {info && <div className="text-sm text-emerald-700 dark:text-emerald-300">{info}</div>}

        <Button type="button" disabled={busy || (!pendingFile && !profile?.ccq_card_path)} onClick={save}>{t("ccqCard.save")}</Button>
    </div>
  );
}
