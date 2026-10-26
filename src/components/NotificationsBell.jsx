import React from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";
import { formatHM } from "@/lib/time";
import { notificationTarget, useManagerNotifications } from "@/lib/use-manager-notifications";

const TIME_FIELDS = new Set(["depart", "arrivee", "fin"]);

function formatChangeValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (TIME_FIELDS.has(field)) return String(value).slice(0, 5);
  return String(value);
}

// One unread manager notification in a bell menu (V2 bell, employee shell, V3 single bell).
export function ManagerNotificationItem({ notification, onOpen, t }) {
  return (
    <DropdownMenuItem onSelect={() => onOpen(notification)} className="block border-t px-3 py-3 bg-destructive/10">
      <div className="font-semibold">{notification.employeeName}</div>
      <div className="text-xs text-muted-foreground">
        {notification.type === "meal_claim"
          ? t("notifications.meal")
          : notification.type === "parking_receipt"
            ? t("notifications.parking")
          : notification.type === "ccq_renewal"
            ? t("notifications.ccqRenewal", { date: notification.changes?.ccq_expiration || "" })
          : notification.type === "overtime_job_edited"
            ? t("notifications.overtimeEdited", { hours: formatHM(notification.daily_minutes / 60) })
            : t("notifications.overtime", { hours: formatHM(notification.daily_minutes / 60) })}
      </div>
      {notification.type === "overtime_job_edited" && notification.changes && Object.keys(notification.changes).length > 0 && (
        <div className="mt-1.5 space-y-0.5 rounded-md border bg-muted/40 p-1.5 text-xs">
          <div className="font-semibold text-muted-foreground">{t("notifications.changesTitle")}</div>
          {Object.entries(notification.changes).map(([field, val]) => (
            <div key={field} className="flex flex-wrap items-center gap-x-1">
              <span className="font-medium">{t(`notifications.field.${field}`)}:</span>
              <span className="text-muted-foreground line-through">{formatChangeValue(field, val?.from)}</span>
              <span aria-hidden="true">→</span>
              <span className="font-semibold">{formatChangeValue(field, val?.to)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</div>
    </DropdownMenuItem>
  );
}

// « Tout marquer comme lu »: every unread notification of the list, without opening any.
export function MarkAllReadButton({ onClick, t }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={(event) => { event.preventDefault(); onClick(); }}>
      <CheckCheck className="h-3.5 w-3.5" />{t("notifications.markAllRead")}
    </Button>
  );
}

export default function NotificationsBell() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const enabled = isManagerRole(role);
  const { visible, unread, load, markRead } = useManagerNotifications(enabled, user?.id);

  if (!enabled) return null;

  async function openNotification(notification) {
    await markRead([notification]);
    navigate(notificationTarget(notification));
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-11 w-11 text-destructive hover:text-destructive sm:h-10 sm:w-10" aria-label={t("notifications.title")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-[calc(100vw-1rem)] overflow-y-auto sm:w-80">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <span className="text-sm font-semibold">{t("notifications.title")}</span>
          {unread > 0 && <MarkAllReadButton onClick={() => markRead(visible)} t={t} />}
        </div>
        {visible.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>}
        {visible.map((notification) => (
          <ManagerNotificationItem key={notification.id} notification={notification} onOpen={openNotification} t={t} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
