import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/use-t";

export default function MealClaimsManager() {
  const { user } = useAuth();
  const t = useT();
  const [claims, setClaims] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [treatments, setTreatments] = useState({});
  const [visible, setVisible] = useState(new Set());

  async function load() {
    const { data } = await supabase.from("meal_claims").select("*").order("created_at", { ascending: false });
    const rows = data || [];
    const ids = [...new Set(rows.map((claim) => claim.user_id))];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    setProfiles(new Map((people || []).map((person) => [person.id, person])));
    setClaims(rows);
    setTreatments(Object.fromEntries(rows.map((claim) => [claim.id, claim.payroll_treatment || "expense_reimbursement"])));
  }
  useEffect(() => { load(); }, []);

  async function toggleReceipt(claim) {
    if (visible.has(claim.id)) return setVisible((current) => { const next = new Set(current); next.delete(claim.id); return next; });
    const { data } = await supabase.storage.from("meal-receipts").createSignedUrl(claim.storage_path, 300);
    setClaims((current) => current.map((row) => row.id === claim.id ? { ...row, imageUrl: data?.signedUrl } : row));
    setVisible((current) => new Set(current).add(claim.id));
  }

  async function review(claim, status) {
    await supabase.from("meal_claims").update({ status, payroll_treatment: treatments[claim.id], reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", claim.id);
    load();
  }

  return <div className="space-y-3">
    <Card><CardContent className="p-4"><h2 className="font-semibold">{t("meals.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("meals.description")}</p></CardContent></Card>
    {claims.map((claim) => { const person = profiles.get(claim.user_id); return <Card key={claim.id}><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{person?.full_name || person?.email}</div><div className="text-sm text-muted-foreground">{claim.job_date} · $30 · {claim.status}</div></div><Button type="button" variant="outline" size="sm" onClick={() => toggleReceipt(claim)}>{visible.has(claim.id) ? t("common.hide") : t("meals.showReceipt")}</Button></div>
      {visible.has(claim.id) && (claim.imageUrl ? <img src={claim.imageUrl} alt={t("meals.receiptAlt")} className="max-h-96 w-full rounded-md border object-contain" /> : <p className="text-sm text-muted-foreground">{t("manager.parking.imageUnavailable")}</p>)}
      {claim.status === "pending" && <div className="flex flex-wrap items-center gap-2"><Select value={treatments[claim.id] || "expense_reimbursement"} onChange={(e) => setTreatments((current) => ({ ...current, [claim.id]: e.target.value }))} className="max-w-xs"><option value="expense_reimbursement">{t("meals.reimbursement")}</option><option value="taxable_benefit">{t("meals.taxable")}</option></Select><Button size="sm" onClick={() => review(claim, "approved")}>{t("manager.approve")}</Button><Button size="sm" variant="destructive" onClick={() => review(claim, "rejected")}>{t("meals.reject")}</Button></div>}
    </CardContent></Card>; })}
    {!claims.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("meals.empty")}</CardContent></Card>}
  </div>;
}
