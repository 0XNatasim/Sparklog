import dayjs from "dayjs";

// CCQ calendar for employees (Profile): statutory holidays and the mandatory construction vacations,
// read from company_holidays (readable by every signed-in user, filled by migration 0098).
// Consecutive days with the same label become one block (a two-week vacation = one line).
export const REMINDER_DAYS = 7;

const MS_DAY = 86400000;
const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / MS_DAY);

// rows: [{ holiday_date, label }] -> [{ start, end, label, days }] sorted by start.
export function calendarBlocks(rows) {
  const sorted = [...(rows || [])]
    .filter((row) => row?.holiday_date)
    .map((row) => ({ date: String(row.holiday_date).slice(0, 10), label: row.label || "" }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const blocks = [];
  for (const { date, label } of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.label === label && dayNumber(date) === dayNumber(last.end) + 1) {
      last.end = date;
      last.days += 1;
    } else if (!last || last.end !== date) {
      blocks.push({ start: date, end: date, label, days: 1 });
    }
  }
  return blocks;
}

// Blocks that are not over yet (today included), soonest first.
export function upcomingBlocks(blocks, today, limit = Infinity) {
  return (blocks || []).filter((block) => block.end >= today).slice(0, limit);
}

// Days from `today` to the block's first day (0 = starts today, negative = already started).
export function daysUntil(block, today) {
  return dayNumber(block.start) - dayNumber(today);
}

// One holiday / vacation = one key: once an employee presses OK the reminder never comes back for it.
export const blockKey = (block) => `${block.start}|${block.label}`;

// The next block that starts within `windowDays` days (today included) and was not dismissed:
// the reminder shown the week before. `dismissed` = Set of blockKey.
export function reminderBlock(blocks, today, windowDays = REMINDER_DAYS, dismissed = new Set()) {
  return upcomingBlocks(blocks, today).find((block) => {
    const days = daysUntil(block, today);
    return days >= 0 && days <= windowDays && !dismissed.has(blockKey(block));
  }) || null;
}

// Dismissed reminders live in this browser, per account (no migration): « OK » on one device does not
// hide it on another. Entries whose block ended more than 30 days ago are dropped.
const storageKey = (userId) => `sparklog.ccqCalendarSeen.${userId}`;
function storage() {
  try { return window.localStorage || null; } catch { return null; }
}

export function readDismissed(userId, today) {
  const store = storage();
  if (!store || !userId) return new Set();
  try {
    const list = JSON.parse(store.getItem(storageKey(userId)) || "[]");
    const keep = (Array.isArray(list) ? list : []).filter((key) => typeof key === "string"
      && dayNumber(String(key).slice(0, 10)) >= dayNumber(today) - 30);
    return new Set(keep);
  } catch { return new Set(); }
}

export function dismissBlock(userId, block, today) {
  const next = readDismissed(userId, today).add(blockKey(block));
  const store = storage();
  if (store && userId) {
    try { store.setItem(storageKey(userId), JSON.stringify([...next])); } catch { /* private mode: dismissed for this visit only */ }
  }
  return next;
}

// Uses the global dayjs locale (set by LanguageProvider).
export function formatBlockRange(block) {
  const start = dayjs(block.start);
  const end = dayjs(block.end);
  if (block.start === block.end) return start.format("dddd D MMMM YYYY");
  return start.year() === end.year()
    ? `${start.format("D MMM")} → ${end.format("D MMM YYYY")}`
    : `${start.format("D MMM YYYY")} → ${end.format("D MMM YYYY")}`;
}
