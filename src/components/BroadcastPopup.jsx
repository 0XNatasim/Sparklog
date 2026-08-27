import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "@/lib/use-t";
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
    if (!user?.id) { setQueue([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("broadcast_recipients")
        .select("broadcast_id, acknowledged_at, manager_broadcasts(body, created_at)")
        .eq("employee_id", user.id)
        .is("acknowledged_at", null);
      if (cancelled) return;
      const rows = (data || [])
        .filter((r) => r.manager_broadcasts)
        .sort((a, b) => new Date(a.manager_broadcasts.created_at) - new Date(b.manager_broadcasts.created_at));
      setQueue(rows);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const current = queue[0];

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
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("broadcast.popupTitle")}</DialogTitle>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm">{current.manager_broadcasts.body}</p>
        <p className="text-xs text-muted-foreground">{dayjs(current.manager_broadcasts.created_at).format("DD MMM YYYY HH:mm")}</p>
        <DialogFooter>
          <Button type="button" disabled={busy} onClick={acknowledge}>{busy ? t("common.working") : t("broadcast.acknowledge")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
