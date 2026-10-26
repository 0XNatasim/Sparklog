import React, { useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ManagerNotificationItem, MarkAllReadButton } from "@/components/NotificationsBell";
import { BroadcastDialog, BroadcastItem } from "@/components/EmployeeNotificationsBell";
import { canAccessSection, isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";
import { notificationTargetV3, useManagerNotifications } from "@/lib/use-manager-notifications";
import { useEmployeeBroadcasts } from "@/lib/use-employee-broadcasts";

// Gestion V3: one bell instead of two. It lists the manager notifications (overtime proofs,
// suppers, parking, CCQ renewals) for whoever may open Justificatifs — managers, owner, and an office
// admin with the « Notifications » section, who had no bell for them before — and the messages sent
// to the person when they are not a manager (an office admin also receives them). One count.
export default function ManagerBell() {
  const { user, role, adminSections } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [opened, setOpened] = useState(null);
  const userId = user?.id;
  const showNotifications = canAccessSection(role, adminSections, "notifications");
  const showMessages = Boolean(userId) && !isManagerRole(role);
  const notifications = useManagerNotifications(showNotifications, userId);
  const messages = useEmployeeBroadcasts(showMessages, userId);

  if (!showNotifications && !showMessages) return null;
  const unread = notifications.unread + messages.unread;

  async function openNotification(notification) {
    await notifications.markRead([notification]);
    navigate(notificationTargetV3(notification));
  }

  function openMessage(item) {
    setOpened(item);
    messages.acknowledge(item);
  }

  const both = showNotifications && showMessages;
  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) { notifications.load(); messages.load(); } }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={`relative h-11 w-11 sm:h-10 sm:w-10 ${unread > 0 ? "text-destructive hover:text-destructive" : ""}`} aria-label={t("notifications.title")}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[28rem] w-[calc(100vw-1rem)] overflow-y-auto sm:w-80">
          {showNotifications && (
            <>
              <div className="flex items-center justify-between gap-2 px-2 py-2">
                <span className="text-sm font-semibold">{t("notifications.title")}</span>
                {notifications.unread > 0 && <MarkAllReadButton onClick={() => notifications.markRead(notifications.visible)} t={t} />}
              </div>
              {notifications.visible.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>}
              {notifications.visible.map((n) => <ManagerNotificationItem key={n.id} notification={n} onOpen={openNotification} t={t} />)}
            </>
          )}
          {showMessages && (
            <>
              <div className={`px-2 py-2 text-sm font-semibold ${both ? "mt-1 border-t-2" : ""}`}>{t("notifications.employeeTitle")}</div>
              {messages.items.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>}
              {messages.items.map((item) => <BroadcastItem key={item.broadcast_id} item={item} onOpen={openMessage} />)}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <BroadcastDialog opened={opened} onClose={() => setOpened(null)} />
    </>
  );
}
