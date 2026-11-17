import React, { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import MonthEndInventoryStep from "@/components/employee-form/MonthEndInventoryStep";
import { fetchMyDueMonthEnd } from "@/lib/month-end-inventory";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// Shown to an employee who still owes the proof of the month-end inventory (their work sheets cannot be submitted
// until it is sent). Hidden when nothing is due or when the read fails: the database is the one that blocks.
export default function MonthEndInventoryBanner({ userId, onSent }) {
  const t = useT();
  const [due, setDue] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    fetchMyDueMonthEnd(supabase).then((row) => { if (alive) setDue(row); }, () => undefined);
    return () => { alive = false; };
  }, [userId]);

  if (!due) return null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        <span className="flex items-center gap-2 font-medium"><ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{t("monthEnd.banner", { date: due.dueDate })}</span>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>{t("monthEnd.bannerOpen")}</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <MonthEndInventoryStep
            t={t}
            userId={userId}
            due={due}
            onLater={() => setOpen(false)}
            onSent={() => { setOpen(false); setDue(null); onSent?.(); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
