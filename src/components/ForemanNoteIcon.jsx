import React, { useState } from "react";
import dayjs from "dayjs";
import { ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";

// The foreman's note on a work sheet (0136) as a clickable icon that opens the text. `unread` (managers only, per
// manager, 0138) turns it red; otherwise it is blue — always blue for the foreman who wrote it. `onOpen` is called each
// time it is opened (the manager's reading is recorded there).
export default function ForemanNoteIcon({ note, unread = false, onOpen, subtitle, className }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!note) return null;
  const label = t(unread ? "foremanNotes.cardIconUnread" : "foremanNotes.cardIcon");
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2",
          unread ? "bg-red-600/15 text-red-600 ring-red-600/50 hover:bg-red-600/25" : "bg-blue-600/15 text-blue-600 ring-blue-600/40 hover:bg-blue-600/25",
          className,
        )}
        title={label}
        aria-label={label}
        onClick={(event) => { event.stopPropagation(); setOpen(true); onOpen?.(); }}
      >
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />{t("foremanNotes.title")}</DialogTitle>
            <DialogDescription>{subtitle}{note.created_at ? ` · ${dayjs(note.created_at).format("D MMM HH:mm")}` : ""}</DialogDescription>
          </DialogHeader>
          {note.audited_name && <div className="text-sm"><span className="text-muted-foreground">{t("foremanNotes.audited")} : </span><b>{note.audited_name}</b></div>}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.body}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
