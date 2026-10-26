// Manager notifications (overtime proofs, suppers, parking, CCQ renewals) for the bell: the 50
// latest, the unread ones, live updates, « read » marks. Shared by the bell of the employee shell
// (NotificationsBell, a manager on their own pages) and the bell of Gestion (ManagerBell).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { SESSION_RESUMED_EVENT } from "@/contexts/AuthContext";

export const NOTIFICATIONS_REFRESH_EVENT = "sparklog:notifications-refresh";

// The 50 latest manager notifications, with the employee's name and whether this manager read it.
async function fetchManagerNotifications(managerId) {
  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabase.from("manager_notifications").select("id, type, employee_id, job_id, meal_claim_id, parking_receipt_id, daily_minutes, changes, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("manager_notification_reads").select("notification_id").eq("manager_id", managerId),
  ]);
  const employeeIds = [...new Set((rows || []).map((row) => row.employee_id))];
  const { data: profiles } = employeeIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", employeeIds)
    : { data: [] };
  const names = new Map((profiles || []).map((profile) => [profile.id, profile.full_name || profile.email]));
  const readIds = new Set((reads || []).map((read) => read.notification_id));
  return (rows || []).map((row) => ({ ...row, employeeName: names.get(row.employee_id) || "Employee", read: readIds.has(row.id) }));
}

// Where a notification leads: À traiter › Justificatifs (proofs, suppers, parking) or Équipe › Employés.
export function notificationTarget(notification) {
  if (notification.type === "meal_claim") return `/manager/todo?tab=receipts&filter=meals&job=${notification.job_id}`;
  if (notification.type === "parking_receipt") return "/manager/todo?tab=receipts&filter=parking";
  if (notification.type === "ccq_renewal") return "/manager/v3/team?tab=employees";
  return `/manager/todo?tab=receipts&filter=overtime&job=${notification.job_id}`;
}

export function useManagerNotifications(enabled, userId) {
  const [notifications, setNotifications] = useState([]);
  const channelRef = useRef(null);
  const on = Boolean(enabled && userId);

  const load = useCallback(() => {
    if (!on) return undefined;
    return fetchManagerNotifications(userId).then(setNotifications);
  }, [on, userId]);

  useEffect(() => {
    if (!on) return undefined;
    const subscribe = () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase.channel("manager-overtime-notifications")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "manager_notifications" }, load)
        .subscribe();
    };
    load();
    subscribe();
    const onResumed = () => { load(); subscribe(); };
    // Fired when a notification is marked read elsewhere (e.g. opening the SMS proof).
    window.addEventListener(SESSION_RESUMED_EVENT, onResumed);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, load);
    return () => {
      window.removeEventListener(SESSION_RESUMED_EVENT, onResumed);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, load);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [load, on]);

  // Only unread notifications are listed: once opened (seen) they drop off the list.
  const visible = on ? notifications.filter((notification) => !notification.read) : [];

  const markRead = useCallback(async (list) => {
    const ids = new Set(list.map((n) => n.id));
    if (!ids.size) return;
    await supabase.from("manager_notification_reads").upsert([...ids].map((id) => ({ notification_id: id, manager_id: userId })));
    setNotifications((current) => current.map((item) => (ids.has(item.id) ? { ...item, read: true } : item)));
  }, [userId]);

  return { visible, unread: visible.length, load, markRead };
}
