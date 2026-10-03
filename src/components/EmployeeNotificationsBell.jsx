import React, { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Bell } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { SESSION_RESUMED_EVENT, useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";

export const BROADCASTS_REFRESH_EVENT = "sparklog:broadcasts-refresh";
const LIST_LIMIT = 30;

// Employee notification bell: lists the manager announcements sent to this employee
// (unread first-class, read ones greyed so they can be re-read). Clicking one simply
// opens that notification again — there is no notifications page for employees.
export default function EmployeeNotificationsBell() {
  const { user, role } = useAuth();
  const t = useT();
  const [items, setItems] = useState([]);
  const [opened, setOpened] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const channelRef = useRef(null);
  const enabled = Boolean(user?.id) && !isManagerRole(role);

  const load = useCallback(async () => {
    if (!enabled) return;
    const { data } = await supabase
      .from("broadcast_recipients")
      .select("broadcast_id, acknowledged_at, manager_broadcasts(body, created_at, image_path)")
      .eq("employee_id", user.id);
    const rows = (data || [])
      .filter((row) => row.manager_broadcasts)
      .sort((a, b) => new Date(b.manager_broadcasts.created_at) - new Date(a.manager_broadcasts.created_at))
      .slice(0, LIST_LIMIT);
    setItems(rows);
  }, [enabled, user?.id]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const subscribe = () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase.channel(`employee-broadcasts-${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "broadcast_recipients", filter: `employee_id=eq.${user.id}` }, load)
        .subscribe();
    };
    subscribe();
    const onResumed = () => { load(); subscribe(); };
    window.addEventListener(SESSION_RESUMED_EVENT, onResumed);
    window.addEventListener(BROADCASTS_REFRESH_EVENT, load);
    return () => {
      window.removeEventListener(SESSION_RESUMED_EVENT, onResumed);
      window.removeEventListener(BROADCASTS_REFRESH_EVENT, load);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, load, user?.id]);

  const path = opened?.manager_broadcasts?.image_path;
  useEffect(() => {
    if (!path) { setImageUrl(""); return undefined; }
    let cancelled = false;
    supabase.storage.from("broadcast-images").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setImageUrl(data?.signedUrl || "");
    });
    return () => { cancelled = true; };
  }, [path]);

  if (!enabled) return null;
  const unread = items.filter((item) => !item.acknowledged_at).length;

  async function openItem(item) {
    setOpened(item);
    if (item.acknowledged_at) return;
    const acknowledgedAt = new Date().toISOString();
    const { error } = await supabase
      .from("broadcast_recipients")
      .update({ acknowledged_at: acknowledgedAt })
      .eq("broadcast_id", item.broadcast_id)
      .eq("employee_id", user.id);
    if (error) return;
    setItems((current) => current.map((row) => row.broadcast_id === item.broadcast_id ? { ...row, acknowledged_at: acknowledgedAt } : row));
    // Let the pop-up queue drop it too, so it doesn't ask for the same OK again.
    window.dispatchEvent(new Event(BROADCASTS_REFRESH_EVENT));
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label={t("notifications.employeeTitle")}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-[calc(100vw-1rem)] overflow-y-auto sm:w-80">
          <div className="px-2 py-2 text-sm font-semibold">{t("notifications.employeeTitle")}</div>
          {items.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>}
          {items.map((item) => (
            <DropdownMenuItem
              key={item.broadcast_id}
              onSelect={() => openItem(item)}
              className={`block border-t px-3 py-3 ${item.acknowledged_at ? "opacity-70" : "bg-red-500/10"}`}
            >
              <div className={`line-clamp-2 whitespace-pre-wrap text-sm ${item.acknowledged_at ? "" : "font-semibold"}`}>{item.manager_broadcasts.body || t("broadcast.popupTitle")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{dayjs(item.manager_broadcasts.created_at).format("DD MMM YYYY HH:mm")}</div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={Boolean(opened)} onOpenChange={(open) => { if (!open) setOpened(null); }}>
        <DialogContent className="flex flex-col gap-3 overflow-hidden sm:max-w-md">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle>{t("broadcast.popupTitle")}</DialogTitle>
          </DialogHeader>
          <div className="-mx-6 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6">
            {opened?.manager_broadcasts?.body && <p className="whitespace-pre-wrap text-sm">{opened.manager_broadcasts.body}</p>}
            {imageUrl && <a href={imageUrl} target="_blank" rel="noopener noreferrer"><img src={imageUrl} alt="" className="max-h-72 w-full rounded-md border object-contain" /></a>}
            {opened && <p className="text-xs text-muted-foreground">{dayjs(opened.manager_broadcasts.created_at).format("DD MMM YYYY HH:mm")}</p>}
          </div>
          <DialogFooter className="shrink-0 border-t pt-3">
            <Button type="button" className="h-11 w-full text-base sm:w-auto" onClick={() => setOpened(null)}>{t("broadcast.acknowledge")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
