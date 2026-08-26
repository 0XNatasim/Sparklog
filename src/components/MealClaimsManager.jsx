import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/use-t";

export default function MealClaimsManager() {
  const t = useT();
  const [claims, setClaims] = useState([]);
  const [profiles, setProfiles] = useState(new Map());

  async function load() {
    const { data } = await supabase.from("meal_claims").select("*").order("created_at", { ascending: false });
    const rows = data || [];
    const ids = [...new Set(rows.map((claim) => claim.user_id))];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    setProfiles(new Map((people || []).map((person) => [person.id, person])));
    setClaims(rows);
  }
  useEffect(() => { load(); }, []);

  return <div className="space-y-3">
    <Card><CardContent className="p-4"><h2 className="font-semibold">{t("meals.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("meals.description")}</p></CardContent></Card>
    {claims.map((claim) => { const person = profiles.get(claim.user_id); return <Card key={claim.id}><CardContent className="space-y-3 p-4">
      <div><div className="font-semibold">{person?.full_name || person?.email}</div><div className="text-sm text-muted-foreground">{claim.job_date} · {t("meals.automaticPayroll")}</div></div>
    </CardContent></Card>; })}
    {!claims.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("meals.empty")}</CardContent></Card>}
  </div>;
}
