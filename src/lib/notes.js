// Gestion › Notes (migration 0111): notes, some with a reminder. A reminder whose time has passed (and
// whose note is not done) is « due »: it counts in the badge on Notes in the side menu.
// A note is private (only its author sees it) or shared with the managers (everyone sees it and may edit,
// snooze or mark it done; only the author deletes it or makes it private again). RLS, manager session.
// A shared note also holds a conversation (0118): replies shown as chat bubbles, with « new » replies
// (written by someone else since I last saw the note) counted on the card and in the menu badge.
import { supabase } from "@/supabaseClient";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

export const NOTES_EVENT = "sparklog:notes";
export const MAX_NOTE = 5000;
export const NOTE_COLUMNS = "id, user_id, body, shared, remind_at, done_at, done_by, created_at, updated_at";
export const NOTE_SCOPES = Object.freeze(["all", "private", "shared"]);
export const MAX_REPLY = 2000;
export const REPLY_COLUMNS = "id, note_id, user_id, body, created_at";
// Replies shown before « earlier replies » (the newest ones).
export const REPLIES_SHOWN = 4;
// Time used when a reminder gets a date but no time.
export const DEFAULT_REMIND_TIME = "08:00";

// due · upcoming (reminder later) · plain (no reminder) · done
export function noteState(note, now = new Date()) {
  if (note?.done_at) return "done";
  if (!note?.remind_at) return "plain";
  return new Date(note.remind_at).getTime() <= now.getTime() ? "due" : "upcoming";
}

const RANK = { due: 0, upcoming: 1, plain: 2, done: 3 };

// Due reminders first (oldest first), then upcoming ones (soonest first), then the other notes
// (newest first), then done notes (most recently done first).
export function sortNotes(notes, now = new Date()) {
  const time = (value) => (value ? new Date(value).getTime() : 0);
  return [...(notes || [])].sort((a, b) => {
    const sa = noteState(a, now);
    const sb = noteState(b, now);
    if (sa !== sb) return RANK[sa] - RANK[sb];
    if (sa === "due" || sa === "upcoming") return time(a.remind_at) - time(b.remind_at);
    if (sa === "done") return time(b.done_at) - time(a.done_at);
    return time(b.created_at) - time(a.created_at);
  });
}

// Scope filter of the page: all notes, my private ones, or the shared ones (mine and the others').
export function inScope(note, scope) {
  if (scope === "private") return !note?.shared;
  if (scope === "shared") return Boolean(note?.shared);
  return true;
}

// Only the author deletes a note or switches it between private and shared (the database agrees).
export function isMine(note, userId) {
  return Boolean(note && userId && note.user_id === userId);
}

// Authors and « done by » people of the notes, and authors of the replies, other than me, for their names.
export function otherPeopleIds(notes, userId, replies = []) {
  const ids = new Set();
  for (const note of notes || []) {
    if (note.user_id && note.user_id !== userId) ids.add(note.user_id);
    if (note.done_by && note.done_by !== userId) ids.add(note.done_by);
  }
  for (const reply of replies || []) if (reply.user_id && reply.user_id !== userId) ids.add(reply.user_id);
  return [...ids];
}

// Replies by note, oldest first (the order of a conversation).
export function repliesByNote(replies) {
  const map = new Map();
  const sorted = [...(replies || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const reply of sorted) {
    if (!map.has(reply.note_id)) map.set(reply.note_id, []);
    map.get(reply.note_id).push(reply);
  }
  return map;
}

// The replies to mark « new » in one conversation: the last `unread` ones written by someone else.
export function newReplyIds(replies, userId, unread) {
  if (!unread) return new Set();
  const others = (replies || []).filter((r) => r.user_id !== userId);
  return new Set(others.slice(-unread).map((r) => r.id));
}

// Notes with at least one new reply (they count once each in the menu badge).
export function unreadNoteCount(unread) {
  let count = 0;
  for (const value of (unread instanceof Map ? unread.values() : Object.values(unread || {}))) if (value > 0) count += 1;
  return count;
}

// The replies shown in a card: all when opened, else the newest REPLIES_SHOWN (and how many are hidden).
export function visibleReplies(replies, expanded) {
  const list = replies || [];
  if (expanded || list.length <= REPLIES_SHOWN) return { shown: list, hidden: 0 };
  return { shown: list.slice(-REPLIES_SHOWN), hidden: list.length - REPLIES_SHOWN };
}

export function dueCount(notes, now = new Date()) {
  return (notes || []).filter((note) => noteState(note, now) === "due").length;
}

// Milliseconds until the next reminder becomes due (null: none), so the badge appears on time.
export function msUntilNextReminder(notes, now = new Date()) {
  const next = (notes || [])
    .filter((note) => noteState(note, now) === "upcoming")
    .map((note) => new Date(note.remind_at).getTime() - now.getTime())
    .sort((a, b) => a - b)[0];
  return next === undefined ? null : next;
}

// "YYYY-MM-DD" + "HH:mm" in the device's time (Montréal for the office) → ISO instant; null if no date.
export function reminderInstant(date, time) {
  if (!date) return null;
  const value = new Date(`${date}T${time || DEFAULT_REMIND_TIME}`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

// The date and time fields of a stored reminder, in the device's time.
export function reminderFields(remindAt) {
  if (!remindAt) return { date: "", time: DEFAULT_REMIND_TIME };
  const d = new Date(remindAt);
  const pad = (n) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// « Reporter » choices: in one hour, tomorrow 8:00, in a week (8:00).
export function snoozeChoices(now = new Date()) {
  const at8 = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  };
  return [
    { key: "hour", at: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
    { key: "tomorrow", at: at8(1) },
    { key: "week", at: at8(7) },
  ];
}

// Text checked before a write (the database refuses the same: 1 to 5000 characters).
export function cleanNoteBody(body) {
  const text = String(body ?? "").trim();
  return text && text.length <= MAX_NOTE ? text : null;
}

// A note folds to its first non-empty line (its title, V2.4.194); the other lines are its text.
export function splitNote(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim());
  if (first < 0) return { title: "", rest: "" };
  return { title: lines[first].trim(), rest: lines.slice(first + 1).join("\n").trim() };
}

// Which notes are unfolded, remembered on this device only (a convenience: folded when unknown).
export const NOTES_OPEN_KEY = "sparklog.notesOpen";
export function readOpenNotes() {
  try {
    const ids = JSON.parse(localStorage.getItem(NOTES_OPEN_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
export function storeOpenNotes(ids) {
  try {
    localStorage.setItem(NOTES_OPEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Private window or blocked storage: the notes simply fold again next time.
  }
}

export function cleanReplyBody(body) {
  const text = String(body ?? "").trim();
  return text && text.length <= MAX_REPLY ? text : null;
}

export async function fetchNotes() {
  const { data, error } = await withTimeout(
    supabase.from("manager_notes").select(NOTE_COLUMNS).order("created_at", { ascending: false }).limit(QUERY_BUDGETS.managerNotes),
    12000,
  );
  if (error) throw error;
  return data || [];
}

// Side-menu badge: only the open reminders are read (mine and the shared ones).
export async function fetchOpenReminders() {
  const { data, error } = await withTimeout(
    supabase.from("manager_notes").select("id, shared, remind_at, done_at").is("done_at", null).not("remind_at", "is", null)
      .order("remind_at", { ascending: true }).limit(QUERY_BUDGETS.managerNotes),
    12000,
  );
  if (error) throw error;
  return data || [];
}

// Replies of these notes (only shared ones have replies), by chunks of ids.
export async function fetchReplies(noteIds) {
  const ids = [...new Set(noteIds || [])];
  const rows = [];
  for (let i = 0; i < ids.length; i += QUERY_BUDGETS.inListChunk) {
    const { data, error } = await withTimeout(
      supabase.from("manager_note_replies").select(REPLY_COLUMNS).in("note_id", ids.slice(i, i + QUERY_BUDGETS.inListChunk))
        .order("created_at", { ascending: true }).limit(QUERY_BUDGETS.managerNoteReplies),
      12000,
    );
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

// note id → number of replies written by someone else since I last saw the note.
export async function fetchUnreadReplies() {
  const { data, error } = await withTimeout(supabase.rpc("my_note_unread_replies"), 12000);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.note_id, row.unread]));
}

// « I have seen these conversations » (the server stamps the time).
export async function markNotesRead(noteIds, userId) {
  const rows = [...new Set(noteIds || [])].map((note_id) => ({ note_id, user_id: userId }));
  if (!rows.length || !userId) return;
  const { error } = await withTimeout(supabase.from("manager_note_reads").upsert(rows, { onConflict: "note_id,user_id" }), 12000);
  if (error) throw error;
}

export function notesChanged() {
  window.dispatchEvent(new Event(NOTES_EVENT));
}
