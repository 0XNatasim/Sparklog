import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { withTimeout } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { DEFECTIVE_SLOT, INVENTORY_BUCKET, INVENTORY_PHOTO_SLOTS } from "@/lib/inventory-screenshots";
import { fetchInventorySlots } from "@/lib/inventory-upload";

// The employee's own view of the end-of-shift inventory screenshots of one day, so they can
// check what was sent when proof of inventory is requested.
export default function InventoryPhotosDialog({ date, userId, onClose }) {
  const t = useT();
  // Pictures of the day shown ({ slot: url | "" }, null while loading) and a load failure, both for
  // the employee and day they were read for.
  const loadKey = `${userId}|${date}`;
  const [loaded, setLoaded] = useState({ key: null, photos: null, failed: false });
  const photos = loaded.key === loadKey ? loaded.photos : null;
  const error = loaded.key === loadKey && loaded.failed ? t("history.inventory.failed") : "";

  useEffect(() => {
    if (!date || !userId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchInventorySlots(supabase, userId, date);
        const paths = rows.map((row) => row.storage_path);
        const urls = new Map();
        if (paths.length) {
          const { data } = await withTimeout(supabase.storage.from(INVENTORY_BUCKET).createSignedUrls(paths, 600), 12000);
          for (const item of data || []) if (item.signedUrl) urls.set(item.path, item.signedUrl);
        }
        if (!cancelled) setLoaded({ key: loadKey, photos: Object.fromEntries(rows.map((row) => [row.slot, urls.get(row.storage_path) || ""])), failed: false });
      } catch {
        if (!cancelled) setLoaded({ key: loadKey, photos: null, failed: true });
      }
    })();
    return () => { cancelled = true; };
  }, [date, userId, loadKey]);

  return (
    <Dialog open={Boolean(date)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("history.inventory.dialogTitle", { date: date || "" })}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {!error && photos === null && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {photos && (
          <div className="grid gap-3 sm:grid-cols-3">
            {/* The defective-products picture (slot 4) is shown only when it was sent. */}
            {INVENTORY_PHOTO_SLOTS.filter((slot) => slot !== DEFECTIVE_SLOT || slot in photos).map((slot) => photos[slot] ? (
              <a key={slot} href={photos[slot]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <img src={photos[slot]} alt={slot === DEFECTIVE_SLOT ? t("form.inventory.defectiveSlot") : t("history.inventory.shotAlt", { n: slot })} loading="lazy" className="max-h-96 w-full object-contain" />
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
