import React, { useState } from "react";
import { BellRing, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/use-t";
import { REMINDER_DAYS, daysUntil, dismissBlock, formatBlockRange, readDismissed, reminderBlock, upcomingBlocks } from "@/lib/ccq-calendar";
import { useCcqCalendar } from "@/lib/use-ccq-calendar";

const SHOWN = 8;

function startsIn(t, days) {
  if (days <= 0) return t("ccqCalendar.startsToday");
  return days === 1 ? t("ccqCalendar.startsTomorrow") : t("ccqCalendar.startsIn", { days });
}

// Reminder the week before a holiday / construction vacation, shown on every page like the update banner.
// « OK » hides it for good for that holiday (this browser, this account).
export function CcqCalendarBanner() {
  const t = useT();
  const { user } = useAuth();
  const { blocks, today } = useCcqCalendar();
  const [dismissed, setDismissed] = useState(null);
  const userId = user?.id;
  const seen = dismissed || readDismissed(userId, today);
  const block = userId ? reminderBlock(blocks, today, REMINDER_DAYS, seen) : null;
  if (!block) return null;
  return (
    <div className="sticky top-0 z-40 border-b-2 border-primary bg-primary/10 px-4 py-3 text-primary" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 text-sm font-semibold sm:text-base">
        <BellRing className="h-5 w-5 shrink-0" />
        <span>
          {block.label} — {startsIn(t, daysUntil(block, today))} ({formatBlockRange(block)}{block.days > 1 ? ` · ${t("ccqCalendar.days", { count: block.days })}` : ""})
        </span>
        <Button type="button" size="sm" onClick={() => setDismissed(dismissBlock(userId, block, today))}>{t("ccqCalendar.ok")}</Button>
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
