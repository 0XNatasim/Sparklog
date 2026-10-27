import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlarmClock, BellRing, Check, Clock, Lock, MessageCircle, Pencil, Plus, RotateCcw, StickyNote, Trash2, Users } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import NoteThread from "@/components/manager/NoteThread";
import { useAuth } from "@/contexts/AuthContext";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  DEFAULT_REMIND_TIME, MAX_NOTE, NOTE_COLUMNS, NOTE_SCOPES, REPLY_COLUMNS, cleanNoteBody, fetchNotes, fetchReplies,
  fetchUnreadReplies, inScope, isMine, markNotesRead, newReplyIds, noteState, notesChanged, otherPeopleIds, reminderFields,
  reminderInstant, repliesByNote, snoozeChoices, sortNotes,
} from "@/lib/notes";
import { useT } from "@/lib/use-t";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { cn, withTimeout } from "@/lib/utils";

const FILTERS = ["open", "reminders", "done"];
const textareaClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const formatWhen = (value) => dayjs(value).format("ddd D MMM YYYY · HH:mm");

// Private / shared choice (only the author sees it on an existing note).
function ShareChoice({ shared, onChange }) {
  const t = useT();
  const options = [
    { value: false, icon: Lock, label: t("notes.private"), on: "border-foreground/40 bg-muted text-foreground" },
    { value: true, icon: Users, label: t("notes.shared"), on: "border-info bg-info/15 text-info" },
  ];
  return (
    <div role="radiogroup" aria-label={t("notes.visibility")} className="inline-flex rounded-md border bg-background p-0.5">
      {options.map(({ value, icon: Icon, label, on }) => (
        <button
          key={String(value)}
          type="button"
          role="radio"
          aria-checked={shared === value}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded border border-transparent px-3 text-sm font-semibold",
            shared === value ? on : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />{label}
        </button>
      ))}
    </div>
  );
}

// Text + private / shared + optional reminder (date, and a time that defaults to 8:00).
function NoteEditor({ initial, onSave, onCancel, busy, submitLabel, canShare = true }) {
  const t = useT();
  const start = reminderFields(initial?.remind_at);
  const [body, setBody] = useState(initial?.body || "");
  const [shared, setShared] = useState(Boolean(initial?.shared));
  const [remind, setRemind] = useState(Boolean(initial?.remind_at));
  const [date, setDate] = useState(start.date || dayjs().add(1, "day").format("YYYY-MM-DD"));
  const [time, setTime] = useState(start.time || DEFAULT_REMIND_TIME);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const text = cleanNoteBody(body);
    if (!text) { setError(t("notes.errors.empty")); return; }
    const remindAt = remind ? reminderInstant(date, time) : null;
    if (remind && !remindAt) { setError(t("notes.errors.date")); return; }
    setError("");
    await onSave({ body: text, remind_at: remindAt, ...(canShare ? { shared } : {}) });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        className={cn(textareaClass, "min-h-[120px]")}
        value={body}
        maxLength={MAX_NOTE}
        placeholder={t("notes.placeholder")}
        aria-label={t("notes.placeholder")}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-end gap-3">
        {canShare && <ShareChoice shared={shared} onChange={setShared} />}
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          <AlarmClock className="h-4 w-4 text-info" />{t("notes.remindMe")}
        </label>
        {remind && (
          <>
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("notes.remindDate")}</span>
              <Input type="date" className="mt-1 h-9 w-auto" value={date} required onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("notes.remindTime")}</span>
              <Input type="time" className="mt-1 h-9 w-auto" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </>
        )}
        <div className="ms-auto flex gap-2">
          {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>}
          <Button type="submit" size="sm" disabled={busy}>{busy ? t("common.working") : submitLabel}</Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function ReminderChip({ note, state }) {
  const t = useT();
  if (!note.remind_at) return null;
  const tone = state === "due" ? "bg-destructive/15 text-destructive"
    : state === "upcoming" ? "bg-info/15 text-info"
      : "bg-muted text-muted-foreground";
  const Icon = state === "due" ? BellRing : AlarmClock;
  return (
    <span className={cn("inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-sm font-semibold", tone)}>
      <Icon className="h-4 w-4" />
      {t(state === "due" ? "notes.dueSince" : "notes.remindAt", { when: formatWhen(note.remind_at) })}
    </span>
  );
}

// Who wrote / finished a shared note: « Karine » for someone else, « toi » for me.
function PersonName({ id, me, names }) {
  const t = useT();
  if (id === me) return t("notes.you");
  return names.get(id) || t("notes.someone");
}

// Gestion › Notes: my private notes and the notes shared between managers, larger cards than the sent
// notifications, due reminders first. Shared notes have a blue edge and a « Partagée » label, and a
// conversation under the note (0118); a note with new replies comes first and says how many.
export default function NotesPanel() {
  const t = useT();
  const { user } = useAuth();
  const me = user?.id;
  const [confirm, confirmDialog] = useConfirmDialog();
  const [notes, setNotes] = useState([]);
  const [names, setNames] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("open");
  const [scope, setScope] = useState("all");
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [replies, setReplies] = useState([]);
  // note id → ids of the replies that were new when they were loaded (they keep their mark on this visit).
  const [fresh, setFresh] = useState(() => new Map());

  useEffect(() => {
    let cancelled = false;
    fetchNotes()
      .then((rows) => { if (!cancelled) { setNotes(rows); setErr(""); } })
      .catch((error) => { if (!cancelled) setErr(friendlyErrorMessage(error, t)); })
      .finally(() => { if (!cancelled) { setLoading(false); setNow(new Date()); } });
    return () => { cancelled = true; };
  }, [t]);

  // Conversations of the shared notes: loaded with the notes, again every minute while the page is shown
  // and when it comes back. New replies get their mark, then the notes are marked as seen (menu badge).
  const sharedIds = useMemo(() => notes.filter((n) => n.shared).map((n) => n.id).sort().join(","), [notes]);
  useEffect(() => {
    const ids = sharedIds ? sharedIds.split(",") : [];
    if (!ids.length || !me) return undefined;
    let cancelled = false;
    async function load() {
      if (document.hidden) return;
      try {
        const [rows, unread] = await Promise.all([fetchReplies(ids), fetchUnreadReplies()]);
        if (cancelled) return;
        const grouped = repliesByNote(rows);
        const unseen = [...unread.entries()].filter(([id, n]) => n > 0 && grouped.has(id));
        setReplies(rows);
        if (unseen.length) {
          setFresh((current) => {
            const next = new Map(current);
            for (const [id, n] of unseen) next.set(id, new Set([...(next.get(id) || []), ...newReplyIds(grouped.get(id), me, n)]));
            return next;
          });
          await markNotesRead(unseen.map(([id]) => id), me);
          notesChanged();
        }
      } catch (error) {
        console.error("[notes] replies", error);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [sharedIds, me]);
  const threads = useMemo(() => repliesByNote(replies), [replies]);

  // Names of the other managers who wrote or finished a shared note or replied (managers may read profiles).
  const otherIds = useMemo(() => otherPeopleIds(notes, me, replies).sort().join(","), [notes, me, replies]);
  useEffect(() => {
    const ids = otherIds ? otherIds.split(",").slice(0, QUERY_BUDGETS.inListChunk) : [];
    if (!ids.length) return undefined;
    let cancelled = false;
    supabase.from("profiles").select("id, full_name, email").in("id", ids).then(({ data }) => {
      if (!cancelled && data) setNames(new Map(data.map((p) => [p.id, p.full_name || p.email || ""])));
    });
    return () => { cancelled = true; };
  }, [otherIds]);

  // A reminder turns « due » while the page is open: re-check every 30 s.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const scoped = useMemo(() => notes.filter((n) => inScope(n, scope)), [notes, scope]);
  const counts = useMemo(() => ({
    open: scoped.filter((n) => !n.done_at).length,
    reminders: scoped.filter((n) => !n.done_at && n.remind_at).length,
    done: scoped.filter((n) => n.done_at).length,
    due: scoped.filter((n) => noteState(n, now) === "due").length,
    all: notes.filter((n) => !n.done_at).length,
    private: notes.filter((n) => !n.done_at && !n.shared).length,
    shared: notes.filter((n) => !n.done_at && n.shared).length,
  }), [notes, scoped, now]);

  // A note with new replies comes first (like a conversation that just moved), then the usual order.
  const visible = useMemo(() => {
    const sorted = sortNotes(scoped.filter((n) => (
      filter === "done" ? n.done_at : filter === "reminders" ? !n.done_at && n.remind_at : !n.done_at
    )), now);
    return [...sorted.filter((n) => fresh.get(n.id)?.size), ...sorted.filter((n) => !fresh.get(n.id)?.size)];
  }, [scoped, filter, now, fresh]);
  const nameOf = (id) => (id === me ? t("notes.you") : names.get(id) || t("notes.someone"));

  // One write, then the row as stored replaces the local one (and the side-menu badge refreshes).
  async function write(id, run) {
    setBusyId(id);
    setErr("");
    try {
      const { data, error } = await withTimeout(run(), 12000);
      if (error) throw error;
      setNotes((current) => {
        if (!data) return current.filter((n) => n.id !== id);
        return current.some((n) => n.id === data.id) ? current.map((n) => (n.id === data.id ? data : n)) : [data, ...current];
      });
      setNow(new Date());
      notesChanged();
      return true;
    } catch (error) {
      setErr(friendlyErrorMessage(error, t));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const update = (note, values) => write(note.id, () => supabase.from("manager_notes").update(values).eq("id", note.id).select(NOTE_COLUMNS).single());

  async function create(values) {
    if (await write("new", () => supabase.from("manager_notes").insert(values).select(NOTE_COLUMNS).single())) setFormKey((k) => k + 1);
  }

  async function save(note, values) {
    if (await update(note, values)) setEditingId(null);
  }

  async function reply(note, body) {
    setBusyId(note.id);
    setErr("");
    try {
      const { data, error } = await withTimeout(
        supabase.from("manager_note_replies").insert({ note_id: note.id, body }).select(REPLY_COLUMNS).single(),
        12000,
      );
      if (error) throw error;
      setReplies((current) => [...current, data]);
      // Writing in the conversation means I have seen it.
      markNotesRead([note.id], me).then(notesChanged, (error) => console.error("[notes] read", error));
      return true;
    } catch (error) {
      setErr(friendlyErrorMessage(error, t));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function removeReply(row) {
    if (!(await confirm(t("notes.replies.deleteConfirm")))) return;
    setBusyId(row.note_id);
    setErr("");
    try {
      const { error } = await withTimeout(supabase.from("manager_note_replies").delete().eq("id", row.id), 12000);
      if (error) throw error;
      setReplies((current) => current.filter((r) => r.id !== row.id));
    } catch (error) {
      setErr(friendlyErrorMessage(error, t));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(note) {
    if (!(await confirm(t("notes.deleteConfirm")))) return;
    await write(note.id, () => supabase.from("manager_notes").delete().eq("id", note.id).then((res) => ({ ...res, data: null })));
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <Card>
        <CardContent className="space-y-2 p-4 sm:p-5">
          <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />{t("notes.new")}</div>
          <p className="text-xs text-muted-foreground">{t("notes.privateHint")}</p>
          <NoteEditor key={formKey} onSave={create} busy={busyId === "new"} submitLabel={t("notes.add")} />
        </CardContent>
      </Card>

      <div role="radiogroup" aria-label={t("notes.visibility")} className="flex flex-wrap items-center gap-2 text-sm">
        {NOTE_SCOPES.map((key) => {
          const Icon = key === "shared" ? Users : key === "private" ? Lock : StickyNote;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={scope === key}
              onClick={() => setScope(key)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 font-semibold",
                scope === key
                  ? key === "shared" ? "border-info bg-info/15 text-info" : "border-foreground/40 bg-muted text-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />{t(`notes.scope.${key}`)} · {counts[key]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-semibold",
              filter === key ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`notes.filter.${key}`)} · {counts[key]}
          </button>
        ))}
        {counts.due > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1.5 font-semibold text-destructive">
            <BellRing className="h-4 w-4" />{t("notes.dueCount", { count: counts.due })}
          </span>
        )}
      </div>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
      {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {!loading && visible.length === 0 && (
        <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><StickyNote className="h-5 w-5" />{t(`notes.empty.${filter}`)}</CardContent></Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((note) => {
          const state = noteState(note, now);
          const busy = busyId === note.id;
          const mine = isMine(note, me);
          const thread = threads.get(note.id) || [];
          const newCount = fresh.get(note.id)?.size || 0;
          return (
            <Card
              key={note.id}
              className={cn(
                "flex flex-col",
                // Blue left edge on every shared note, kept when a due reminder turns the card red.
                note.shared && "border-l-4 !border-l-info",
                state === "due" ? "border-destructive/50 bg-destructive/5" : note.shared && "bg-info/5",
                state === "done" && "opacity-75",
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                {editingId === note.id ? (
                  <NoteEditor initial={note} busy={busy} canShare={mine} submitLabel={t("common.save")} onCancel={() => setEditingId(null)} onSave={(values) => save(note, values)} />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {note.shared ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-info/15 px-2.5 py-1 text-sm font-semibold text-info">
                          <Users className="h-4 w-4" />
                          {mine ? t("notes.sharedByMe") : <>{t("notes.sharedBy")} <PersonName id={note.user_id} me={me} names={names} /></>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm font-semibold text-muted-foreground">
                          <Lock className="h-4 w-4" />{t("notes.private")}
                        </span>
                      )}
                      <ReminderChip note={note} state={state} />
                      {newCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-sm font-semibold text-destructive">
                          <MessageCircle className="h-4 w-4" />{t("notes.replies.newCount", { count: newCount })}
                        </span>
                      )}
                    </div>
                    <p className={cn("whitespace-pre-wrap break-words text-base leading-relaxed sm:text-lg", state === "done" && "line-through decoration-muted-foreground/50")}>
                      {note.body}
                    </p>
                    <NoteThread
                      note={note}
                      replies={thread}
                      me={me}
                      nameOf={nameOf}
                      newIds={fresh.get(note.id)}
                      busy={busy}
                      onSend={(body) => reply(note, body)}
                      onDelete={removeReply}
                    />
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        {note.done_at ? t("notes.doneOn", { when: formatWhen(note.done_at) }) : t("notes.createdOn", { when: formatWhen(note.created_at) })}
                        {note.shared && note.done_at && note.done_by && <> · {t("notes.doneBy")} <PersonName id={note.done_by} me={me} names={names} /></>}
                      </span>
                      <div className="ms-auto flex flex-wrap items-center gap-1">
                        {state === "done" ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => update(note, { done_at: null })}>
                            <RotateCcw className="mr-1.5 h-4 w-4" />{t("notes.reopen")}
                          </Button>
                        ) : (
                          <>
                            {state === "due" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" disabled={busy}><Clock className="mr-1.5 h-4 w-4" />{t("notes.snooze")}</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {snoozeChoices(new Date()).map((choice) => (
                                    <DropdownMenuItem key={choice.key} onSelect={() => update(note, { remind_at: choice.at })}>
                                      {t(`notes.snoozeTo.${choice.key}`)}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            <Button size="sm" variant="success" disabled={busy} onClick={() => update(note, { done_at: new Date().toISOString() })}>
                              <Check className="mr-1.5 h-4 w-4" />{t("notes.done")}
                            </Button>
                          </>
                        )}
                        <Button size="icon" variant="ghost" className="h-9 w-9" disabled={busy} aria-label={t("notes.edit")} title={t("notes.edit")} onClick={() => setEditingId(note.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {mine && (
                          <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" disabled={busy} aria-label={t("notes.delete")} title={t("notes.delete")} onClick={() => remove(note)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
