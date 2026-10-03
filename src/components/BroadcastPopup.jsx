import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "@/lib/use-t";
import { BROADCASTS_REFRESH_EVENT } from "@/components/EmployeeNotificationsBell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Shows unacknowledged manager broadcasts to the signed-in user, one at a time.
// Re-queries on mount (every page open/reload), so a notification keeps popping
// up until the user presses OK.
export default function BroadcastPopup() {
  const { user } = useAuth();
  const t = useT();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) { setQueue([]); return undefined; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("broadcast_recipients")
        .select("broadcast_id, acknowledged_at, manager_broadcasts(body, created_at, image_path)")
        .eq("employee_id", user.id)
        .is("acknowledged_at", null);
      if (cancelled) return;
      const rows = (data || [])
        .filter((r) => r.manager_broadcasts)
        .sort((a, b) => new Date(a.manager_broadcasts.created_at) - new Date(b.manager_broadcasts.created_at));
      setQueue(rows);
    };
    load();
    // The notification bell acknowledges items too; reload so they leave this queue.
    window.addEventListener(BROADCASTS_REFRESH_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(BROADCASTS_REFRESH_EVENT, load);
    };
  }, [user?.id]);

  const [dismissed, setDismissed] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const current = queue[0];

  useEffect(() => {
    const path = current?.manager_broadcasts?.image_path;
    if (!path) { setImageUrl(""); return; }
    let cancelled = false;
    supabase.storage.from("broadcast-images").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setImageUrl(data?.signedUrl || "");
    });
    return () => { cancelled = true; };
  }, [current?.broadcast_id]);

  async function acknowledge() {
    if (!current || !user?.id) return;
    setBusy(true);
    const { error } = await supabase
      .from("broadcast_recipients")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("broadcast_id", current.broadcast_id)
      .eq("employee_id", user.id);
    setBusy(false);
    if (!error) setQueue((q) => q.slice(1));
  }

  if (!current) return null;

  return (
    <Dialog open={!dismissed} onOpenChange={(o) => { if (!o) setDismissed(true); }}>
      {/* Only the message scrolls: the OK button stays pinned at the bottom even with
          a long message, large text or browser zoom. */}
      <DialogContent className="flex flex-col gap-3 overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{t("broadcast.popupTitle")}</DialogTitle>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6">
          {current.manager_broadcasts.body && <p className="whitespace-pre-wrap text-sm">{current.manager_broadcasts.body}</p>}
          {imageUrl && <a href={imageUrl} target="_blank" rel="noopener noreferrer"><img src={imageUrl} alt="" className="max-h-72 w-full rounded-md border object-contain" /></a>}
          <p className="text-xs text-muted-foreground">{dayjs(current.manager_broadcasts.created_at).format("DD MMM YYYY HH:mm")}</p>
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button type="button" className="h-11 w-full text-base sm:w-auto" disabled={busy} onClick={acknowledge}>{busy ? t("common.working") : t("broadcast.acknowledge")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
