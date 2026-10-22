import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlarmClock, BellRing, Check, Clock, Pencil, Plus, RotateCcw, StickyNote, Trash2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  DEFAULT_REMIND_TIME, MAX_NOTE, NOTE_COLUMNS, cleanNoteBody, fetchNotes, noteState, notesChanged, reminderFields,
  reminderInstant, snoozeChoices, sortNotes,
} from "@/lib/notes";
import { useT } from "@/lib/use-t";
import { cn, withTimeout } from "@/lib/utils";

const FILTERS = ["open", "reminders", "done"];
const textareaClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const formatWhen = (value) => dayjs(value).format("ddd D MMM YYYY · HH:mm");

// Text + optional reminder (date, and a time that defaults to 8:00).
function NoteEditor({ initial, onSave, onCancel, busy, submitLabel }) {
  const t = useT();
  const start = reminderFields(initial?.remind_at);
  const [body, setBody] = useState(initial?.body || "");
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
    await onSave({ body: text, remind_at: remindAt });
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

// Gestion › Notes: my own notes, larger cards than the sent notifications, due reminders first.
export default function NotesPanel() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("open");
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchNotes()
      .then((rows) => { if (!cancelled) { setNotes(rows); setErr(""); } })
      .catch((error) => { if (!cancelled) setErr(friendlyErrorMessage(error, t)); })
      .finally(() => { if (!cancelled) { setLoading(false); setNow(new Date()); } });
    return () => { cancelled = true; };
  }, [t]);

  // A reminder turns « due » while the page is open: re-check every 30 s.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => ({
    open: notes.filter((n) => !n.done_at).length,
    reminders: notes.filter((n) => !n.done_at && n.remind_at).length,
    done: notes.filter((n) => n.done_at).length,
    due: notes.filter((n) => noteState(n, now) === "due").length,
  }), [notes, now]);

  const visible = useMemo(() => sortNotes(notes.filter((n) => (
    filter === "done" ? n.done_at : filter === "reminders" ? !n.done_at && n.remind_at : !n.done_at
  )), now), [notes, filter, now]);

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
          return (
            <Card
              key={note.id}
              className={cn("flex flex-col", state === "due" && "border-destructive/50 bg-destructive/5", state === "done" && "opacity-75")}
            >
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                {editingId === note.id ? (
                  <NoteEditor initial={note} busy={busy} submitLabel={t("common.save")} onCancel={() => setEditingId(null)} onSave={(values) => save(note, values)} />
                ) : (
                  <>
                    <ReminderChip note={note} state={state} />
                    <p className={cn("whitespace-pre-wrap break-words text-base leading-relaxed sm:text-lg", state === "done" && "line-through decoration-muted-foreground/50")}>
                      {note.body}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        {note.done_at ? t("notes.doneOn", { when: formatWhen(note.done_at) }) : t("notes.createdOn", { when: formatWhen(note.created_at) })}
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
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" disabled={busy} aria-label={t("notes.delete")} title={t("notes.delete")} onClick={() => remove(note)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
