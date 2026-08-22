import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/use-t";

export default function NotificationsBell() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [notifications, setNotifications] = useState([]);

  const load = useCallback(async () => {
    if (role !== "manager" || !user?.id) return;
    const [{ data: rows }, { data: reads }] = await Promise.all([
      supabase.from("manager_notifications").select("id, employee_id, job_id, daily_minutes, created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("manager_notification_reads").select("notification_id").eq("manager_id", user.id),
    ]);
    const employeeIds = [...new Set((rows || []).map((row) => row.employee_id))];
    const { data: profiles } = employeeIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", employeeIds)
      : { data: [] };
    const names = new Map((profiles || []).map((profile) => [profile.id, profile.full_name || profile.email]));
    const readIds = new Set((reads || []).map((read) => read.notification_id));
    setNotifications((rows || []).map((row) => ({ ...row, employeeName: names.get(row.employee_id) || "Employee", read: readIds.has(row.id) })));
  }, [role, user?.id]);

  useEffect(() => {
    load();
    if (role !== "manager") return undefined;
    const channel = supabase.channel("manager-overtime-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "manager_notifications" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, role]);

  if (role !== "manager") return null;
  const unread = notifications.filter((notification) => !notification.read).length;

  async function openNotification(notification) {
    await supabase.from("manager_notification_reads").upsert({ notification_id: notification.id, manager_id: user.id });
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    navigate(`/manager?job=${notification.job_id}`);
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-red-600 hover:text-red-700 dark:text-red-400" aria-label={t("notifications.title")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <div className="px-2 py-2 text-sm font-semibold">{t("notifications.title")}</div>
        {notifications.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>}
        {notifications.map((notification) => (
          <DropdownMenuItem key={notification.id} onSelect={() => openNotification(notification)} className={`block border-t px-3 py-3 ${notification.read ? "opacity-65" : "bg-red-500/10"}`}>
            <div className="font-semibold">{notification.employeeName}</div>
            <div className="text-xs text-muted-foreground">{t("notifications.overtime", { hours: (notification.daily_minutes / 60).toFixed(2) })}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
