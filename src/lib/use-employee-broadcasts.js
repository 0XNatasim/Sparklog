// The manager messages sent to this employee, for the bell: the 30 latest, live updates, the
// « read » (OK) mark and the app-icon badge. Shared by EmployeeNotificationsBell and the single
// bell of Gestion V3 (ManagerBell).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { SESSION_RESUMED_EVENT } from "@/contexts/AuthContext";
import { setAppBadgeCount } from "@/lib/push-support";

export const BROADCASTS_REFRESH_EVENT = "sparklog:broadcasts-refresh";
const LIST_LIMIT = 30;

// The latest announcements sent to this employee, newest first.
async function fetchEmployeeBroadcasts(userId) {
  const { data } = await supabase
    .from("broadcast_recipients")
    .select("broadcast_id, acknowledged_at, manager_broadcasts(body, created_at, image_path, attachments, edited_at)")
    .eq("employee_id", userId);
  return (data || [])
    .filter((row) => row.manager_broadcasts)
    .sort((a, b) => new Date(b.manager_broadcasts.created_at) - new Date(a.manager_broadcasts.created_at))
    .slice(0, LIST_LIMIT);
}

export function useEmployeeBroadcasts(enabled, userId) {
  const [items, setItems] = useState([]);
  const channelRef = useRef(null);
  const on = Boolean(enabled && userId);

  const load = useCallback(() => {
    if (!on) return undefined;
    return fetchEmployeeBroadcasts(userId).then(setItems);
  }, [on, userId]);

  useEffect(() => {
    if (!on) return undefined;
    load();
    const subscribe = () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase.channel(`employee-broadcasts-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "broadcast_recipients", filter: `employee_id=eq.${userId}` }, load)
        // A message edited with « read it again » clears this employee's OK (0107): show it as unread again.
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "broadcast_recipients", filter: `employee_id=eq.${userId}` }, () => {
          load();
          window.dispatchEvent(new Event(BROADCASTS_REFRESH_EVENT));
        })
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
  }, [on, load, userId]);

  const shown = on ? items : [];
  const unread = shown.filter((item) => !item.acknowledged_at).length;

  // Keep the app-icon badge equal to the unread count; clear it on logout/unmount.
  useEffect(() => {
    if (on) setAppBadgeCount(unread);
  }, [on, unread]);
  useEffect(() => () => { setAppBadgeCount(0); }, []);

  // Opening a message is its OK (the same as the pop-up's button).
  const acknowledge = useCallback(async (item) => {
    if (item.acknowledged_at) return;
    const acknowledgedAt = new Date().toISOString();
    const { error } = await supabase
      .from("broadcast_recipients")
      .update({ acknowledged_at: acknowledgedAt })
      .eq("broadcast_id", item.broadcast_id)
      .eq("employee_id", userId);
    if (error) return;
    setItems((current) => current.map((row) => (row.broadcast_id === item.broadcast_id ? { ...row, acknowledged_at: acknowledgedAt } : row)));
    // Let the pop-up queue drop it too, so it doesn't ask for the same OK again.
    window.dispatchEvent(new Event(BROADCASTS_REFRESH_EVENT));
  }, [userId]);

  return { items: shown, unread, load, acknowledge };
}
