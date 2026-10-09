import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, withTimeout } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { INVENTORY_BUCKET, INVENTORY_SLOTS } from "@/lib/inventory-screenshots";
import { INVENTORY_STATE_ORDER, compareInventory, effectiveOcrStatus, mergeInventoryItems, summarizeInventoryDay, sumCrewInventory } from "@/lib/inventory-items";
import { deleteInventoryScreenshots, fetchPreviousInventory, requestInventoryReading } from "@/lib/inventory-upload";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { QUERY_BUDGETS } from "@/lib/query-budgets";

const CHIP_CLASS = {
  missing: "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
  partial: "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
  photos: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  review: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  reading: "text-muted-foreground",
  ok: "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-300",
};

// Manager view of the end-of-shift inventory. One row per employee for the chosen day; a tap
// opens that employee's card: the written equipment list first, the photos second.
export default function InventoryScreenshotsPanel() {
  const t = useT();
  const [date, setDate] = useState(companyDate());
  const [people, setPeople] = useState([]);
  const [shots, setShots] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState(null);
  const [photos, setPhotos] = useState({});
  const [hideZero, setHideZero] = useState(true);
  // Comparison with the employee's previous inventory day: { personId, date, status, data }.
  const [compare, setCompare] = useState(null);
  const [crewOpen, setCrewOpen] = useState(false);
  const [rereadBusy, setRereadBusy] = useState(false);
  const [requestedAt, setRequestedAt] = useState({});
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  // useT() returns a new function on every render: keep it out of effect/callback dependencies,
  // or the data reloads (and the open card closes) on every render.
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setErr("");
    try {
      const [peopleResult, shotsResult, itemsResult] = await Promise.all([
        withTimeout(
          supabase.from("profiles").select("id, full_name, email, inventory_screenshots_enabled").order("full_name").limit(QUERY_BUDGETS.inventoryPeople),
          12000
        ),
        withTimeout(
          supabase.from("inventory_screenshots").select("user_id, slot, storage_path, ocr_status, list_total, created_at")
            .eq("job_date", date).order("slot").limit(QUERY_BUDGETS.inventoryRows),
          12000
        ),
        withTimeout(
          supabase.from("inventory_items").select("user_id, slot, code, name, quantity")
            .eq("job_date", date).limit(QUERY_BUDGETS.inventoryItems),
          12000
        ),
      ]);
      for (const result of [peopleResult, shotsResult, itemsResult]) if (result.error) throw result.error;
      setPeople(peopleResult.data || []);
      setShots(shotsResult.data || []);
      setItems(itemsResult.data || []);
    } catch (error) {
      setErr(friendlyErrorMessage(error, tRef.current, "mgr.inventory.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { setOpenId(null); setPhotos({}); setCompare(null); }, [date]);
  useEffect(() => { setCompare(null); }, [openId]);
  useEffect(() => { load(); }, [load]);

  const entries = useMemo(() => {
    const shotsBy = new Map();
    const now = Date.now();
    for (const raw of shots) {
      const shot = { ...raw, ocr_status: effectiveOcrStatus(raw, now, requestedAt[`${raw.user_id}:${raw.slot}`]) };
      shotsBy.set(shot.user_id, [...(shotsBy.get(shot.user_id) || []), shot]);
    }
    const itemsBy = new Map();
    for (const item of items) itemsBy.set(item.user_id, [...(itemsBy.get(item.user_id) || []), item]);
    return people
      .filter((p) => p.inventory_screenshots_enabled || shotsBy.has(p.id))
      .map((p) => ({ person: p, name: p.full_name || p.email || p.id, ...summarizeInventoryDay(shotsBy.get(p.id) || [], itemsBy.get(p.id) || []), shots: shotsBy.get(p.id) || [] }))
      .sort((a, b) => INVENTORY_STATE_ORDER.indexOf(a.state) - INVENTORY_STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name, "fr-CA"));
  }, [people, shots, items, requestedAt]);

  // The OCR runs in the background: keep refreshing quietly while some reading is pending.
  const pending = entries.some((entry) => entry.state === "reading");
  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setTimeout(() => load({ quiet: true }), 6000);
    return () => window.clearTimeout(timer);
  }, [pending, load, shots]);

  const open = entries.find((entry) => entry.person.id === openId) || null;

  // Photos are signed only for the card being opened.
  useEffect(() => {
    if (!open || photos[open.person.id]) return;
    const paths = open.shots.map((shot) => shot.storage_path);
    if (!paths.length) return;
    supabase.storage.from(INVENTORY_BUCKET).createSignedUrls(paths, 600).then(({ data }) => {
      const urls = new Map((data || []).map((row) => [row.path, row.signedUrl]));
      setPhotos((current) => ({ ...current, [open.person.id]: Object.fromEntries(open.shots.map((shot) => [shot.slot, urls.get(shot.storage_path) || ""])) }));
    }).catch(() => undefined);
  }, [open, photos]);

  async function rereadAll() {
    if (!open || rereadBusy) return;
    setRereadBusy(true);
    const stamp = Date.now();
    setRequestedAt((current) => ({ ...current, ...Object.fromEntries(open.shots.map((shot) => [`${open.person.id}:${shot.slot}`, stamp])) }));
    await Promise.all(open.shots.map((shot) => requestInventoryReading(supabase, { jobDate: date, slot: shot.slot, userId: open.person.id })));
    await load({ quiet: true });
    setRereadBusy(false);
  }

  // Deletes one screenshot (slot) or all of the open employee's screenshots for the day.
  async function removeShots(slot = null) {
    if (!open || deleteBusy) return;
    const message = slot
      ? t("mgr.inventory.confirmDeleteOne", { n: slot, name: open.name })
      : t("mgr.inventory.confirmDeleteAll", { name: open.name });
    if (!(await confirm(message))) return;
    setDeleteBusy(true);
    setErr("");
    try {
      await deleteInventoryScreenshots(supabase, { userId: open.person.id, jobDate: date, slot });
      setPhotos((current) => ({ ...current, [open.person.id]: undefined }));
      if (!slot || open.shots.length <= 1) setOpenId(null);
      await load({ quiet: true });
    } catch (error) {
      setErr(friendlyErrorMessage(error, t, "mgr.inventory.deleteFailed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  const crew = useMemo(() => sumCrewInventory(entries), [entries]);
  const crewRows = crew.rows.filter((row) => !(hideZero && row.total === 0));

  const received = entries.filter((entry) => entry.state !== "missing").length;
  const shiftDay = (days) => setDate((current) => dayjs(current).add(days, "day").format("YYYY-MM-DD"));

  function chipLabel(entry) {
    if (entry.state === "missing") return t("mgr.inventory.state.missing");
    if (entry.state === "partial") return t("mgr.inventory.state.partial", { count: entry.captures });
    if (entry.state === "photos") return t("mgr.inventory.state.photos");
    if (entry.state === "reading") return t("mgr.inventory.state.reading");
    if (entry.state === "review") return t("mgr.inventory.state.review", { count: entry.count });
    return t("mgr.inventory.state.ok", { count: entry.count });
  }

  async function toggleCompare() {
    if (!open) return;
    if (compare?.status === "ready" || compare?.status === "loading") { setCompare(null); return; }
    const personId = open.person.id;
    setCompare({ personId, status: "loading" });
    try {
      const previous = await fetchPreviousInventory(supabase, { userId: personId, beforeDate: date });
      setCompare(previous ? { personId, status: "ready", previous } : { personId, status: "none" });
    } catch (error) {
      console.error("[inventory] comparison failed", error);
      setCompare({ personId, status: "failed" });
    }
  }

  const comparison = useMemo(() => {
    if (!open || compare?.status !== "ready" || compare.personId !== open.person.id) return null;
    const previousSummary = summarizeInventoryDay(compare.previous.shots, compare.previous.items);
    const rows = compareInventory(open.items, mergeInventoryItems(compare.previous.items), {
      todayComplete: open.state === "ok",
      previousComplete: previousSummary.state === "ok",
    });
    return { date: compare.previous.date, rows };
  }, [open, compare]);

  const shownItems = !open ? [] : comparison
    ? comparison.rows.filter((row) => !(hideZero && !Number(row.today) && !Number(row.previous)))
    : open.items.filter((item) => !(hideZero && Number(item.quantity) === 0));
  const fmtQty = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("fr-CA", { minimumFractionDigits: 2 }));
  const fmtDiff = (value) => (value === null ? "—" : `${value > 0 ? "+" : ""}${Number(value).toLocaleString("fr-CA", { maximumFractionDigits: 2 })}`);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Button type="button" variant="outline" size="icon" aria-label={t("mgr.inventory.previousDay")} onClick={() => shiftDay(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" aria-label={t("mgr.inventory.date")} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} className="h-9 w-44" />
          <Button type="button" variant="outline" size="icon" aria-label={t("mgr.inventory.nextDay")} onClick={() => shiftDay(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="sm" disabled={date === companyDate()} onClick={() => setDate(companyDate())}>{t("mgr.inventory.today")}</Button>
          <div className="ml-auto flex items-center gap-3">
            {entries.length > 0 && <span className="text-sm text-muted-foreground">{t("mgr.inventory.received", { received, total: entries.length })}</span>}
            <Button type="button" variant="outline" size="sm" disabled={crew.counted === 0} onClick={() => setCrewOpen(true)}>
              <Users className="mr-1 h-4 w-4" />{t("mgr.inventory.crew")}
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label={t("common.retry")} disabled={loading} onClick={() => load()}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300" role="alert">{err}</div>}

      {!loading && !err && entries.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("mgr.inventory.empty")}</CardContent></Card>
      )}

      {entries.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {entries.map((entry) => (
              <button
                key={entry.person.id}
                type="button"
                onClick={() => setOpenId(entry.person.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="font-medium">{entry.name}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className={CHIP_CLASS[entry.state]}>{chipLabel(entry)}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.name} · {dayjs(date).format("YYYY-MM-DD")}</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue={open.state === "photos" || open.state === "partial" ? "photos" : "list"} key={`${open.person.id}-${date}`}>
                <TabsList>
                  <TabsTrigger value="list">{t("mgr.inventory.tabList")}</TabsTrigger>
                  <TabsTrigger value="photos">{t("mgr.inventory.tabPhotos", { count: open.captures })}</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-3">
                  {open.state === "missing" && <p className="text-sm text-muted-foreground">{t("mgr.inventory.noCapture")}</p>}
                  {open.state === "reading" && <p className="text-sm text-muted-foreground">{t("mgr.inventory.readingNow")}</p>}
                  {open.state === "photos" && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{t("mgr.inventory.unreadable")}</p>}
                  {open.state === "review" && (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                      {open.expected ? t("mgr.inventory.mismatch", { count: open.count, expected: open.expected }) : t("mgr.inventory.unverified")}
                    </p>
                  )}
                  {open.state === "partial" && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{t("mgr.inventory.partialNote", { count: open.captures })}</p>}
                  {open.items.length > 0 && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{t("mgr.inventory.itemCount", { count: open.count })}</span>
                        <div className="flex flex-wrap items-center gap-3">
                          <Button type="button" variant={compare?.status === "ready" ? "default" : "outline"} size="sm" aria-pressed={compare?.status === "ready"} disabled={compare?.status === "loading"} onClick={toggleCompare}>
                            {compare?.status === "loading" ? t("common.loading") : t("mgr.inventory.compare")}
                          </Button>
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" checked={hideZero} onChange={(event) => setHideZero(event.target.checked)} className="h-4 w-4 accent-primary" />
                            {t("mgr.inventory.hideZero")}
                          </label>
                        </div>
                      </div>
                      {compare?.status === "none" && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{t("mgr.inventory.compareNone")}</p>}
                      {compare?.status === "failed" && <p className="text-sm text-destructive dark:text-red-300" role="alert">{t("mgr.inventory.compareFailed")}</p>}
                      <div className="overflow-hidden rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">{t("mgr.inventory.colItem")}</th>
                              {comparison && <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.colPrevious", { date: dayjs(comparison.date).format("DD MMM") })}</th>}
                              <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.colQty")}</th>
                              {comparison && <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.colDiff")}</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {shownItems.map((row) => {
                              const code = row.code;
                              const quantity = comparison ? row.today : Number(row.quantity);
                              return (
                                <tr key={code}>
                                  <td className="px-3 py-2"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{code}</div></td>
                                  {comparison && <td className={cn("px-3 py-2 text-right tabular-nums", !Number(row.previous) && "text-muted-foreground")}>{fmtQty(row.previous)}</td>}
                                  <td className={cn("px-3 py-2 text-right tabular-nums", !Number(quantity) && "text-muted-foreground")}>{fmtQty(quantity)}</td>
                                  {comparison && (
                                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", row.diff === null || row.diff === 0 ? "text-muted-foreground" : row.diff < 0 ? "text-destructive dark:text-red-300" : "text-green-700 dark:text-green-300")}>
                                      {fmtDiff(row.diff)}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {open.captures > 0 && open.state !== "reading" && (
                    <Button type="button" variant="outline" size="sm" disabled={rereadBusy} onClick={rereadAll}>
                      <RefreshCw className={cn("mr-1 h-4 w-4", rereadBusy && "animate-spin")} />
                      {t("mgr.inventory.reread")}
                    </Button>
                  )}
                </TabsContent>

                <TabsContent value="photos">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {INVENTORY_SLOTS.map((slot) => {
                      const url = photos[open.person.id]?.[slot];
                      const sent = open.shots.some((shot) => shot.slot === slot);
                      return (
                        <div key={slot} className="space-y-2">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <img src={url} alt={t("mgr.inventory.shotAlt", { n: slot, name: open.name })} loading="lazy" className="max-h-96 w-full object-contain" />
                            </a>
                          ) : (
                            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                              {sent ? t("mgr.inventory.unavailable") : t("form.inventory.slot", { n: slot })}
                            </div>
                          )}
                          {sent && (
                            <Button type="button" variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" disabled={deleteBusy} onClick={() => removeShots(slot)}>
                              <Trash2 className="mr-1 h-4 w-4" />{t("mgr.inventory.delete")}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {open.captures > 1 && (
                    <Button type="button" variant="outline" size="sm" className="mt-3 text-destructive hover:text-destructive" disabled={deleteBusy} onClick={() => removeShots(null)}>
                      <Trash2 className="mr-1 h-4 w-4" />{t("mgr.inventory.deleteAll")}
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={crewOpen} onOpenChange={setCrewOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("mgr.inventory.crewTitle", { date: dayjs(date).format("YYYY-MM-DD") })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("mgr.inventory.crewCounted", { count: crew.counted, items: crew.rows.length })}</span>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={hideZero} onChange={(event) => setHideZero(event.target.checked)} className="h-4 w-4 accent-primary" />
                {t("mgr.inventory.hideZero")}
              </label>
            </div>
            {crew.unverified.length > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                {t("mgr.inventory.crewUnverified", { names: crew.unverified.join(", ") })}
              </p>
            )}
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("mgr.inventory.colItem")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.colTotal")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.colHolders")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {crewRows.map((row) => (
                    <tr key={row.code}>
                      <td className="px-3 py-2"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{row.code}</div></td>
                      <td className={cn("px-3 py-2 text-right font-medium tabular-nums", row.total === 0 && "text-muted-foreground")}>{Number(row.total).toLocaleString("fr-CA", { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.holders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
