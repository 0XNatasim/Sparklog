import React, { useRef, useState } from "react";
import dayjs from "dayjs";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importBrittonRows, readBrittonFile } from "@/lib/britton";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// À traiter › OCR: « Importer Britton » (the .xlsx table of the overtime Britton approved, migration 0156) and the list of the
// Britton lines that have no Sparklog proof (same day and OT). The lines are shown beside the proofs by the table itself.
export default function BrittonImport({ unmatched = [], count = 0, onImported }) {
  const t = useT();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [listOpen, setListOpen] = useState(false);

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = await readBrittonFile(file);
      if (!parsed.headerFound) { setError(t("britton.errors.header")); return; }
      if (parsed.rows.length === 0) { setError(t("britton.errors.empty")); return; }
      const result = await importBrittonRows(supabase, parsed.rows);
      const skipped = parsed.skipped.length ? ` ${t("britton.skipped", { count: parsed.skipped.length, lines: parsed.skipped.slice(0, 8).map((item) => item.line).join(", ") })}` : "";
      setMessage(`${t("britton.imported", { inserted: result.inserted, updated: result.updated })}${skipped}`);
      onImported?.();
    } catch (failure) {
      setError(/xlsx_(invalid|unsupported)/.test(String(failure?.message)) ? t("britton.errors.file") : friendlyErrorMessage(failure, t, "britton.errors.import"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label={t("britton.file")} onChange={pick} />
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
        <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />{busy ? t("britton.importing") : t("britton.import")}
      </Button>
      {count > 0 && (
        <Button type="button" size="sm" variant="outline" onClick={() => setListOpen(true)}>{t("britton.unmatchedButton", { count: unmatched.length })}</Button>
      )}
      {message && <p className="w-full text-sm text-muted-foreground" role="status">{message}</p>}
      {error && <p className="w-full rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("britton.unmatchedTitle")}</DialogTitle>
            <DialogDescription>{t("britton.unmatchedHint")}</DialogDescription>
          </DialogHeader>
          {unmatched.length === 0 ? <p className="text-sm text-muted-foreground">{t("britton.unmatchedNone")}</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">{t("ocr.col.date")}</th><th className="px-2 py-1">{t("ocr.col.employee")}</th><th className="px-2 py-1">OT</th>
                  <th className="px-2 py-1">{t("britton.col.client")}</th><th className="px-2 py-1">{t("britton.col.return")}</th><th className="px-2 py-1">{t("britton.col.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unmatched.map((line) => (
                  <tr key={line.id}>
                    <td className="whitespace-nowrap px-2 py-1">{dayjs(line.job_date).format("DD MMM")}</td>
                    <td className="px-2 py-1">{line.employee_name}</td>
                    <td className="px-2 py-1">{line.ot}</td>
                    <td className="px-2 py-1">{line.client_minutes} min</td>
                    <td className="px-2 py-1">{line.return_minutes} min</td>
                    <td className="px-2 py-1">{line.total_minutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
