// Scheduling the sending time of a Communications message (migration 0163). The manager types a date and a time in
// Montréal time (the company's clock); the message is saved with scheduled_for = that instant and the recipients only see it then.
import { companyDate, resolveCompanyWallTime } from "@/lib/company-time";

export const MAX_SCHEDULE_DAYS = 90; // the database refuses further than 90 days away

// { ok: true, iso } | { ok: false, error: "invalid" | "nonexistent" | "ambiguous" | "past" | "tooFar" }.
// `now` is injectable for tests. At least one minute from now (the scheduled task runs every minute).
export function parseScheduledAt(date, time, now = new Date()) {
  const wall = resolveCompanyWallTime(date, time);
  if (wall.status === "invalid") return { ok: false, error: "invalid" };
  if (wall.status === "nonexistent") return { ok: false, error: "nonexistent" };
  if (wall.status === "ambiguous") return { ok: false, error: "ambiguous" };
  const at = wall.instant.getTime();
  if (at < now.getTime() + 60 * 1000) return { ok: false, error: "past" };
  if (at > now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) return { ok: false, error: "tooFar" };
  return { ok: true, iso: wall.instant.toISOString() };
}

// A message that is waiting for its sending time (managers see it in the log with a « Programmé » tag).
export const isScheduledPending = (broadcast, now = new Date()) => Boolean(broadcast?.scheduled_for) && new Date(broadcast.scheduled_for).getTime() > now.getTime();

// Default value of the date field: today in Montréal.
export const scheduleMinDate = () => companyDate();
