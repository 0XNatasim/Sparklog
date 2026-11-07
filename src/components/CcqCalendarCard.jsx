import React from "react";
import { BellRing, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/use-t";
import { daysUntil, formatBlockRange, reminderBlock, upcomingBlocks } from "@/lib/ccq-calendar";

const SHOWN = 8;

function startsIn(t, days) {
  if (days <= 0) return t("ccqCalendar.startsToday");
  return days === 1 ? t("ccqCalendar.startsTomorrow") : t("ccqCalendar.startsIn", { days });
}

// Reminder the week before a holiday / construction vacation. Shown at the top of the Profile.
export function CcqCalendarReminder({ blocks, today }) {
  const t = useT();
  const block = reminderBlock(blocks, today);
  if (!block) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
      <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <div className="font-semibold">{block.label} — {startsIn(t, daysUntil(block, today))}</div>
        <div className="text-muted-foreground">{formatBlockRange(block)}{block.days > 1 ? ` · ${t("ccqCalendar.days", { count: block.days })}` : ""}</div>
      </div>
    </div>
  );
}

export function CcqCalendarCard({ blocks, today, loaded }) {
  const t = useT();
  const upcoming = upcomingBlocks(blocks, today, SHOWN);
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 select-none [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-primary" />{t("ccqCalendar.title")}</span>
            <span className="mt-1 text-sm text-muted-foreground">{t("ccqCalendar.description")}</span>
          </span>
        </summary>
        <div className="border-t p-4">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{loaded ? t("ccqCalendar.none") : t("common.loading")}</p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((block) => {
                const days = daysUntil(block, today);
                return (
                  <li key={block.start + block.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      <span className="block font-medium">{block.label}</span>
                      <span className="text-muted-foreground">{formatBlockRange(block)}{block.days > 1 ? ` · ${t("ccqCalendar.days", { count: block.days })}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{days <= 0 ? t("ccqCalendar.inProgress") : t("ccqCalendar.inDays", { days })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </Card>
  );
}
