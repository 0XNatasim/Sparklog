import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { withTimeout } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { INVENTORY_BUCKET, INVENTORY_SLOTS } from "@/lib/inventory-screenshots";
import { fetchInventorySlots } from "@/lib/inventory-upload";

// The employee's own view of the end-of-shift inventory screenshots of one day, so they can
// check what was sent when proof of inventory is requested.
export default function InventoryPhotosDialog({ date, userId, onClose }) {
  const t = useT();
  const tRef = useRef(t); // useT() returns a new function each render: keep it out of deps
  tRef.current = t;
  const [photos, setPhotos] = useState(null); // { slot: url | "" }
  const [error, setError] = useState("");

  useEffect(() => {
    if (!date || !userId) return undefined;
    let cancelled = false;
    setPhotos(null);
    setError("");
    (async () => {
      try {
        const rows = await fetchInventorySlots(supabase, userId, date);
        const paths = rows.map((row) => row.storage_path);
        const urls = new Map();
        if (paths.length) {
          const { data } = await withTimeout(supabase.storage.from(INVENTORY_BUCKET).createSignedUrls(paths, 600), 12000);
          for (const item of data || []) if (item.signedUrl) urls.set(item.path, item.signedUrl);
        }
        if (!cancelled) setPhotos(Object.fromEntries(rows.map((row) => [row.slot, urls.get(row.storage_path) || ""])));
      } catch {
        if (!cancelled) setError(tRef.current("history.inventory.failed"));
      }
    })();
    return () => { cancelled = true; };
  }, [date, userId]);

  return (
    <Dialog open={Boolean(date)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("history.inventory.dialogTitle", { date: date || "" })}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive dark:text-red-300" role="alert">{error}</p>}
        {!error && photos === null && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {photos && (
          <div className="grid gap-3 sm:grid-cols-3">
            {INVENTORY_SLOTS.map((slot) => photos[slot] ? (
              <a key={slot} href={photos[slot]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <img src={photos[slot]} alt={t("history.inventory.shotAlt", { n: slot })} loading="lazy" className="max-h-96 w-full object-contain" />
              </a>
            ) : (
              <div key={slot} className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                {slot in photos ? t("history.inventory.unavailable") : t("form.inventory.slot", { n: slot })}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
