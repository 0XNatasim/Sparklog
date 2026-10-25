import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { useConfirmDialog } from "@/components/ConfirmDialog";

// Temps › Débloquer journée: let one employee enter or edit a closed day (job_entry_unlocks).
// plainWords (Gestion V3): « rouvrir / refermer une journée » and « retourner pour correction » instead of
// « déverrouiller ». The V2 page keeps its words.
export default function UnlockDayManager({ plainWords = false }) {
  const t = useT();
  const word = (key) => (plainWords ? `${key}.plain` : key);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [message, setMessage] = useState("");
  const [employees, setEmployees] = useState([]);
  const [unlockEmployee, setUnlockEmployee] = useState("");
  const [unlockDate, setUnlockDate] = useState(companyDate());
  const [unlocks, setUnlocks] = useState([]);
  const [busy, setBusy] = useState(false);

  const fetchUnlocks = () => Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_paused").order("full_name"),
    supabase.from("job_entry_unlocks").select("id, user_id, job_date, unlocked_until").order("job_date", { ascending: false }),
  ]);
  function applyUnlocks([{ data: employeeRows }, { data: unlockRows }]) {
    setEmployees((employeeRows || []).filter((employee) => !employee.is_paused));
    setUnlocks(unlockRows || []);
  }
  async function load() {
    applyUnlocks(await fetchUnlocks());
  }

  useEffect(() => {
    let alive = true;
    fetchUnlocks().then((results) => { if (alive) applyUnlocks(results); });
    return () => { alive = false; };
  }, []);

  const employeeName = (id) => {
    const e = employees.find((row) => row.id === id);
    return e?.full_name || e?.email || id;
  };

  async function unlockDay() {
    if (!unlockEmployee || !unlockDate) {
      setMessage(t("timeRules.selectEmployeeAndDate"));
      return;
    }
    setBusy(true);
    // unlocked_until null = open until the manager removes it. Upsert so a
    // second unlock for the same employee/day is a no-op instead of an error.
    const { error } = await supabase
      .from("job_entry_unlocks")
      .upsert({ user_id: unlockEmployee, job_date: unlockDate, unlocked_until: null }, { onConflict: "user_id,job_date" });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(await reopenSubmittedJobs(unlockEmployee, unlockDate));
      await load();
    }
    setBusy(false);
  }

  // Unlocking a day does not reopen jobs already submitted that day; offer to return them.
  async function reopenSubmittedJobs(userId, jobDate) {
    const { data: submitted, error } = await supabase
      .from("jobs")
      .select("id, updated_at")
      .eq("user_id", userId)
      .eq("job_date", jobDate)
      .eq("status", "submitted");
    if (error || !submitted?.length) return t(word("timeRules.dayUnlocked"));
    const ok = await confirm(t(word("timeRules.reopenSubmittedConfirm"), { name: employeeName(userId), count: submitted.length, date: jobDate }));
    if (!ok) return t(word("timeRules.dayUnlocked"));
    const results = await Promise.all(submitted.map((job) => supabase.rpc("return_job_for_correction", {
      p_job_id: job.id,
      p_expected_updated_at: job.updated_at,
    })));
    const failed = results.filter((result) => result.error).length;
    return failed
      ? t(word("timeRules.reopenSubmittedPartial"), { done: submitted.length - failed, failed })
      : t(word("timeRules.reopenSubmittedDone"), { count: submitted.length });
  }

  async function removeUnlock(row) {
    if (!(await confirm(t(word("confirm.removeUnlock"), { name: employeeName(row.user_id), date: row.job_date })))) return;
    const { id } = row;
    setBusy(true);
    const { error } = await supabase.from("job_entry_unlocks").delete().eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage(t(word("timeRules.unlockRemoved")));
      setUnlocks((current) => current.filter((row) => row.id !== id));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs" role="status">{message}</div>}
        <p className="text-xs text-muted-foreground">{t(word("timeRules.unlockHelp"))}</p>
        <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("notifications.employee")}</span>
            <Select value={unlockEmployee} onChange={(e) => setUnlockEmployee(e.target.value)}>
              <option value="">{t("timeRules.chooseEmployee")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name || employee.email}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("timeRules.unlockDate")}</span>
            <Input type="date" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} />
          </label>
          <Button type="button" className="h-11 sm:h-10" disabled={busy} onClick={unlockDay}>{busy ? t("common.working") : t(word("timeRules.unlockDay"))}</Button>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium">{t(word("timeRules.activeUnlocks"))}</span>
          {unlocks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t(word("timeRules.noUnlocks"))}</p>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {unlocks.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                  <span><b>{row.job_date}</b> · {employeeName(row.user_id)}</span>
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-destructive" disabled={busy} onClick={() => removeUnlock(row)}>{t(word("timeRules.remove"))}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
        {confirmDialog}
      </CardContent>
    </Card>
  );
}
