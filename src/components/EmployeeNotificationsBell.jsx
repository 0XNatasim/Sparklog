import React, { useState } from "react";
import dayjs from "dayjs";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import BroadcastAttachments, { EditedTag } from "@/components/BroadcastAttachments";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";
import { useEmployeeBroadcasts } from "@/lib/use-employee-broadcasts";

export { BROADCASTS_REFRESH_EVENT } from "@/lib/use-employee-broadcasts";

// One message in a bell menu: unread first-class, read ones greyed so they can be re-read.
export function BroadcastItem({ item, onOpen }) {
  return (
    <DropdownMenuItem
      onSelect={() => onOpen(item)}
      className={`block border-t px-3 py-3 ${item.acknowledged_at ? "opacity-70" : "bg-destructive/10"}`}
    >
      <BroadcastItemBody item={item} />
    </DropdownMenuItem>
  );
}

function BroadcastItemBody({ item }) {
  const t = useT();
  return (
    <>
      <div className={`line-clamp-2 whitespace-pre-wrap text-sm ${item.acknowledged_at ? "" : "font-semibold"}`}>{item.manager_broadcasts.body || t("broadcast.popupTitle")}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {dayjs(item.manager_broadcasts.created_at).format("DD MMM YYYY HH:mm")}
        {item.manager_broadcasts.edited_at && <> · <EditedTag at={item.manager_broadcasts.edited_at} /></>}
      </div>
    </>
  );
}

// The message opened from the bell, in full.
export function BroadcastDialog({ opened, onClose }) {
  const t = useT();
  return (
    <Dialog open={Boolean(opened)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col gap-3 overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{t("broadcast.popupTitle")}</DialogTitle>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6">
          {opened?.manager_broadcasts?.body && <p className="whitespace-pre-wrap text-sm">{opened.manager_broadcasts.body}</p>}
          {opened && <BroadcastAttachments broadcast={opened.manager_broadcasts} />}
          {opened && (
            <p className="text-xs text-muted-foreground">
              {dayjs(opened.manager_broadcasts.created_at).format("DD MMM YYYY HH:mm")}
              {opened.manager_broadcasts.edited_at && <> · <EditedTag at={opened.manager_broadcasts.edited_at} /></>}
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button type="button" className="h-11 w-full text-base sm:w-auto" onClick={onClose}>{t("broadcast.acknowledge")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Employee notification bell: lists the manager announcements sent to this employee
// (unread first-class, read ones greyed so they can be re-read). Clicking one simply
// opens that notification again — there is no notifications page for employees.
export default function EmployeeNotificationsBell() {
  const { user, role } = useAuth();
  const t = useT();
  const [opened, setOpened] = useState(null);
  const enabled = Boolean(user?.id) && !isManagerRole(role);
  const { items, unread, load, acknowledge } = useEmployeeBroadcasts(enabled, user?.id);

  if (!enabled) return null;

  function openItem(item) {
    setOpened(item);
    acknowledge(item);
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="touch" className="relative" aria-label={t("notifications.employeeTitle")}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-[calc(100vw-1rem)] overflow-y-auto sm:w-80">
          <div className="px-2 py-2 text-sm font-semibold">{t("notifications.employeeTitle")}</div>
          {items.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>}
          {items.map((item) => <BroadcastItem key={item.broadcast_id} item={item} onOpen={openItem} />)}
        </DropdownMenuContent>
      </DropdownMenu>
      <BroadcastDialog opened={opened} onClose={() => setOpened(null)} />
    </>
  );
}
