import React, { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { NEW_HIRE } from "@/lib/signups";

const EMPTY_FORM = { full_name: "", email: "", phone: "", password: "" };

// Header card of Gestion › Employés: the roster counters (a counter is also a filter) and the
// owner/manager account creation, which bypasses the sign-up e-mail rate limit (create_employee).
export default function AddEmployeeCard({ counts, statusFilter, onFilter, onCreated, onError, onInfo }) {
  const t = useT();
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addResult, setAddResult] = useState(null); // { email, password } after a successful create

  // Create an employee account server-side (no confirmation email → no rate limit).
  async function createEmployee(e) {
    e?.preventDefault?.();
    if (addBusy) return;
    onError(""); onInfo(""); setAddResult(null);
    setAddBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("auth.failed"));
      const { data, error } = await supabase.functions.invoke("create_employee", {
        body: { full_name: addForm.full_name, email: addForm.email, phone: addForm.phone, password: addForm.password || undefined },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        let message = error.message;
        try { const ctx = await error.context?.json?.(); if (ctx?.error) message = ctx.error; } catch { /* keep default */ }
        throw new Error(message);
      }
      if (data && data.ok === false) throw new Error(data.error || "Create failed");
      setAddResult({ email: data.email, password: data.password });
      setAddForm(EMPTY_FORM);
      onInfo(t("employees.add.created"));
      await onCreated();
    } catch (e2) {
      onError(e2?.message || "Create failed");
    } finally {
      setAddBusy(false);
    }
  }

  const filters = [
    ["pending", counts.pending, "bg-destructive/15 text-destructive"],
    [NEW_HIRE, counts[NEW_HIRE], "bg-info/15 text-info"],
    ["former", counts.former, "bg-muted text-muted-foreground"],
    ["noPush", counts.noPush, "bg-warning/15 text-warning"],
  ];

  return (
    <Card>
      <CardContent className="p-4">
        {!addOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button size="sm" onClick={() => { setAddOpen(true); setAddResult(null); }}>{t("employees.add.button")}</Button>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 font-semibold text-success">
                {counts.active} · {t("employees.active")}
              </span>
              {counts.attention > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 font-semibold text-warning">
                  <TriangleAlert className="h-3.5 w-3.5" />{counts.attention} · {t("employees.needAttention")}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-semibold text-muted-foreground">
                {counts.inactive} · {t("employees.paused")}
              </span>
              {filters.map(([key, count, tone]) => (count > 0 || statusFilter === key) && (
                <button
                  key={key}
                  type="button"
                  aria-pressed={statusFilter === key}
                  onClick={() => onFilter((current) => (current === key ? "all" : key))}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${tone} ${statusFilter === key ? "ring-2 ring-ring" : ""}`}
                >
                  {count} · {t(`employees.filter.${key}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={createEmployee} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t("employees.add.title")}</div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("employees.add.hint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs"><span className="text-muted-foreground">{t("auth.fullName")}</span>
                <Input value={addForm.full_name} onChange={(e) => setAddForm((s) => ({ ...s, full_name: e.target.value }))} className="mt-1" required /></label>
              <label className="block text-xs"><span className="text-muted-foreground">{t("auth.email")}</span>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm((s) => ({ ...s, email: e.target.value }))} className="mt-1" required /></label>
              <label className="block text-xs"><span className="text-muted-foreground">{t("auth.phone")}</span>
                <Input value={addForm.phone} onChange={(e) => setAddForm((s) => ({ ...s, phone: e.target.value }))} className="mt-1" /></label>
              <label className="block text-xs"><span className="text-muted-foreground">{t("employees.add.passwordOptional")}</span>
                <Input value={addForm.password} onChange={(e) => setAddForm((s) => ({ ...s, password: e.target.value }))} className="mt-1" placeholder={t("employees.add.passwordPlaceholder")} /></label>
            </div>
            <Button type="submit" size="sm" disabled={addBusy}>{addBusy ? t("common.working") : t("employees.add.submit")}</Button>
          </form>
        )}
        {addResult && (
          <div className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            <div className="font-semibold">{t("employees.add.credentials")}</div>
            <div className="mt-1 font-mono text-xs">{addResult.email}</div>
            <div className="font-mono text-xs">{t("employees.add.tempPassword")}: <b>{addResult.password}</b></div>
            <p className="mt-1 text-xs">{t("employees.add.share")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
