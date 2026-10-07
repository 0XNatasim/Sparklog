import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { withTimeout } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { INVENTORY_BUCKET, INVENTORY_SLOTS, missingInventorySlots } from "@/lib/inventory-screenshots";
import { QUERY_BUDGETS } from "@/lib/query-budgets";

// Manager view of the end-of-shift inventory screenshots: one card per employee for a day,
// plus the employees who have the option ticked but sent nothing yet.
export default function InventoryScreenshotsPanel() {
  const t = useT();
  const [date, setDate] = useState(companyDate());
  const [employeeId, setEmployeeId] = useState("all");
  const [people, setPeople] = useState([]);
  const [cards, setCards] = useState([]);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [peopleResult, rowsResult] = await Promise.all([
        withTimeout(
          supabase.from("profiles").select("id, full_name, email, inventory_screenshots_enabled").order("full_name").limit(QUERY_BUDGETS.inventoryPeople),
          12000
        ),
        withTimeout(
          supabase.from("inventory_screenshots").select("user_id, slot, storage_path, created_at")
            .eq("job_date", date).order("slot").limit(QUERY_BUDGETS.inventoryRows),
          12000
        ),
      ]);
      if (peopleResult.error) throw peopleResult.error;
      if (rowsResult.error) throw rowsResult.error;
      const profiles = peopleResult.data || [];
      setPeople(profiles);
      const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.email || p.id]));

      const rows = rowsResult.data || [];
      const paths = rows.map((row) => row.storage_path);
      const urls = new Map();
      if (paths.length) {
        const { data: signed } = await withTimeout(supabase.storage.from(INVENTORY_BUCKET).createSignedUrls(paths, 600), 12000);
        for (const item of signed || []) if (item.signedUrl) urls.set(item.path, item.signedUrl);
      }
      const byUser = new Map();
      for (const row of rows) {
        const list = byUser.get(row.user_id) || [];
        list.push({ ...row, url: urls.get(row.storage_path) || "" });
        byUser.set(row.user_id, list);
      }
      setCards([...byUser.entries()]
        .map(([id, shots]) => ({ id, name: nameOf.get(id) || id, shots, missing: missingInventorySlots(shots) }))
        .sort((a, b) => a.name.localeCompare(b.name)));
      setMissing(profiles.filter((p) => p.inventory_screenshots_enabled && !byUser.has(p.id)));
    } catch (error) {
      setErr(friendlyErrorMessage(error, t, "mgr.inventory.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => { load(); }, [load]);

  const visibleCards = employeeId === "all" ? cards : cards.filter((card) => card.id === employeeId);
  const visibleMissing = employeeId === "all" ? missing : missing.filter((p) => p.id === employeeId);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="grid gap-1">
            <Label htmlFor="inventory-date" className="text-xs">{t("mgr.inventory.date")}</Label>
            <Input id="inventory-date" type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} className="h-9 w-44" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="inventory-employee" className="text-xs">{t("mgr.inventory.employee")}</Label>
            <Select id="inventory-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-9 w-56">
              <option value="all">{t("mgr.inventory.allEmployees")}</option>
              {people.filter((p) => p.inventory_screenshots_enabled || cards.some((card) => card.id === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </Select>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={load}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.retry")}
          </Button>
        </CardContent>
      </Card>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300" role="alert">{err}</div>}

      {visibleMissing.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <div className="text-sm font-semibold">{t("mgr.inventory.missingTitle")}</div>
            <div className="flex flex-wrap gap-2">
              {visibleMissing.map((p) => <Badge key={p.id} variant="outline">{p.full_name || p.email}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !err && visibleCards.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("mgr.inventory.empty")}</CardContent></Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {visibleCards.map((card) => (
          <Card key={card.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{card.name}</div>
                {card.missing.length > 0 && (
                  <Badge variant="destructive">{t("mgr.inventory.incomplete", { count: card.shots.length })}</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {INVENTORY_SLOTS.map((slot) => {
                  const shot = card.shots.find((row) => row.slot === slot);
                  return shot?.url ? (
                    <button key={slot} type="button" className="overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setViewer({ name: card.name, slot, url: shot.url })}>
                      <img src={shot.url} alt={t("mgr.inventory.shotAlt", { name: card.name, n: slot })} loading="lazy" className="h-40 w-full object-cover object-top" />
                    </button>
                  ) : (
                    <div key={slot} className="flex h-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                      {shot ? t("mgr.inventory.unavailable") : t("form.inventory.slot", { n: slot })}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(viewer)} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewer ? `${viewer.name} · ${t("form.inventory.slot", { n: viewer.slot })}` : ""}</DialogTitle>
          </DialogHeader>
          {viewer && <img src={viewer.url} alt="" className="max-h-[75vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
