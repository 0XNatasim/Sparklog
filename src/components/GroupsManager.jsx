import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UserX, UsersRound, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  MAX_GROUP_NAME, MAX_GROUP_NOTE, cleanGroupName, createGroup, deleteGroup, fetchGroups, groupMembers, groupNameTaken,
  saveGroupMembers, ungroupedPeople, updateGroup,
} from "@/lib/employee-groups";
import { DEPARTURE_STATUSES, isNewHire } from "@/lib/signups";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";

const personName = (person) => person.full_name || person.email || "—";
const isFormer = (person) => DEPARTURE_STATUSES.includes(person.departure_status);

// Name + note of a group (new or renamed).
function GroupForm({ initial, groups, onSave, onCancel, busy }) {
  const t = useT();
  const [name, setName] = useState(initial?.name || "");
  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const clean = cleanGroupName(name);
    if (!clean) { setError(t("groups.nameRequired")); return; }
    if (groupNameTaken(groups, clean, initial?.id)) { setError(t("groups.nameTaken")); return; }
    setError("");
    onSave({ name: clean, note });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("groups.name")}</span>
          <Input value={name} maxLength={MAX_GROUP_NAME} onChange={(event) => setName(event.target.value)} placeholder={t("groups.namePlaceholder")} autoFocus />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("groups.note")}</span>
          <Input value={note} maxLength={MAX_GROUP_NOTE} onChange={(event) => setNote(event.target.value)} placeholder={t("groups.notePlaceholder")} />
        </label>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? t("common.working") : t("common.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

// Tick the group's employees: active accounts and new hires waiting to start; an inactive or former
// member stays listed (to remove), the other inactive accounts are hidden.
function MembersEditor({ group, people, today, onSave, onCancel, busy }) {
  const t = useT();
  const [picked, setPicked] = useState(() => new Set(group.memberIds));
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("fr-CA");
  const choices = people.filter((person) => (!person.is_paused && !isFormer(person)) || isNewHire(person, today) || group.memberIds.includes(person.id));
  const shown = query ? choices.filter((person) => personName(person).toLocaleLowerCase("fr-CA").includes(query)) : choices;
  const toggle = (id) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("groups.search")} className="h-9 max-w-xs" />
        <span className="text-sm text-muted-foreground">{t("groups.pickedCount", { count: picked.size })}</span>
      </div>
      <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
        {shown.map((person) => (
          <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <input type="checkbox" checked={picked.has(person.id)} onChange={() => toggle(person.id)} className="h-4 w-4 accent-primary" />
            <span className="min-w-0 truncate">{personName(person)}</span>
            {isNewHire(person, today) && <span className="shrink-0 rounded bg-info/15 px-1.5 text-xs text-info">{t("groups.newHire")}</span>}
            {!isNewHire(person, today) && (person.is_paused || isFormer(person)) && <span className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">{t("groups.inactive")}</span>}
          </label>
        ))}
        {shown.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("groups.noMatch")}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => onSave([...picked])}>{busy ? t("common.working") : t("common.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}

// Field employees in no group (warehouse), each with a picker to put them in one.
function UngroupedCard({ people, groups, today, busy, onAdd }) {
  const t = useT();
  if (people.length === 0) {
    return <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">{t("groups.ungrouped.none")}</p>;
  }
  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-2 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-warning"><UserX className="h-4 w-4" />{t("groups.ungrouped.title", { count: people.length })}</h3>
          <p className="text-xs text-muted-foreground">{t("groups.ungrouped.help")}</p>
        </div>
        <ul className="divide-y">
          {people.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 break-words text-sm">
                {personName(person)}
                {isNewHire(person, today) && <span className="ml-1 text-xs text-info">· {t("groups.newHire")}</span>}
              </span>
              {groups.length > 0 && (
                <select
                  value=""
                  disabled={busy}
                  aria-label={t("groups.ungrouped.addTo", { name: personName(person) })}
                  onChange={(event) => { if (event.target.value) onAdd(person, event.target.value); }}
                  className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t("groups.ungrouped.pick")}</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function GroupsManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const today = companyDate();
  const [groups, setGroups] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [membersId, setMembersId] = useState("");
  const [busy, setBusy] = useState(false);

  // Groups and the people that can be ticked; throws on a read error.
  const fetchAll = useCallback(async () => {
    const [nextGroups, { data, error }] = await Promise.all([
      fetchGroups(),
      withTimeout(supabase.from("profiles").select("id, full_name, email, role, is_paused, departure_status, start_date").order("full_name"), 12000),
    ]);
    if (error) throw error;
    return { nextGroups, nextPeople: data || [] };
  }, []);

  const apply = useCallback(({ nextGroups, nextPeople }) => {
    setGroups(nextGroups);
    setPeople(nextPeople);
    setErr("");
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await fetchAll());
    } catch (error) {
      setErr(friendlyErrorMessage(error, t, "groups.loadFailed"));
    }
  }, [apply, fetchAll, t]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((result) => { if (!cancelled) apply(result); })
      .catch((error) => { if (!cancelled) setErr(friendlyErrorMessage(error, t, "groups.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apply, fetchAll, t]);

  const byName = useMemo(() => new Map(groups.map((group) => [group.id, groupMembers(group, people)])), [groups, people]);
  const ungrouped = useMemo(() => ungroupedPeople(groups, people, today), [groups, people, today]);

  async function run(action, done) {
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      await action();
      setInfo(done);
      await load();
      return true;
    } catch (error) {
      setErr(friendlyErrorMessage(error, t, "groups.saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(values) {
    let newId = "";
    if (await run(async () => { newId = await createGroup(values); }, t("groups.created", { name: values.name }))) {
      setCreating(false);
      setMembersId(newId);
    }
  }

  async function rename(group, values) {
    if (await run(() => updateGroup(group.id, values), t("groups.saved"))) setEditingId("");
  }

  async function saveMembers(group, ids) {
    if (await run(() => saveGroupMembers(group.id, group.memberIds, ids), t("groups.membersSaved", { name: group.name, count: ids.length }))) setMembersId("");
  }

  async function addToGroup(person, groupId) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    await run(() => saveGroupMembers(group.id, group.memberIds, [...group.memberIds, person.id]), t("groups.ungrouped.added", { name: personName(person), group: group.name }));
  }

  async function remove(group) {
    if (!(await confirm(t("groups.deleteConfirm", { name: group.name, count: group.memberIds.length })))) return;
    await run(() => deleteGroup(group.id), t("groups.deleted", { name: group.name }));
  }

  return (
    <div className="space-y-3">
      {confirmDialog}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold"><UsersRound className="h-5 w-5" />{t("groups.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("groups.hint")}</p>
            </div>
            {!creating && (
              <Button type="button" size="sm" onClick={() => { setCreating(true); setInfo(""); }}>
                <Plus className="mr-1 h-4 w-4" />{t("groups.add")}
              </Button>
            )}
          </div>
          {creating && <GroupForm groups={groups} busy={busy} onSave={create} onCancel={() => setCreating(false)} />}
        </CardContent>
      </Card>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{err}</div>}
      {info && <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm text-primary" role="status">{info}</div>}

      {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {!loading && groups.length === 0 && !err && <p className="text-sm text-muted-foreground">{t("groups.empty")}</p>}
      {!loading && !err && <UngroupedCard people={ungrouped} groups={groups} today={today} busy={busy} onAdd={addToGroup} />}

      {groups.map((group) => {
        const members = byName.get(group.id) || [];
        return (
          <Card key={group.id}>
            <CardContent className="space-y-3 p-4">
              {editingId === group.id ? (
                <GroupForm initial={group} groups={groups} busy={busy} onSave={(values) => rename(group, values)} onCancel={() => setEditingId("")} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">{group.name}</div>
                    {group.note && <div className="text-sm text-muted-foreground">{group.note}</div>}
                    <div className="text-sm text-muted-foreground">{t("groups.memberCount", { count: members.length })}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant={membersId === group.id ? "default" : "outline"} onClick={() => setMembersId(membersId === group.id ? "" : group.id)}>
                      <UsersRound className="mr-1 h-4 w-4" />{t("groups.editMembers")}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={t("groups.rename")} title={t("groups.rename")} onClick={() => setEditingId(group.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={t("groups.delete")} title={t("groups.delete")} disabled={busy} onClick={() => remove(group)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {membersId === group.id ? (
                <MembersEditor group={group} people={people} today={today} busy={busy} onSave={(ids) => saveMembers(group, ids)} onCancel={() => setMembersId("")} />
              ) : members.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((person) => {
                    const muted = !isNewHire(person, today) && (person.is_paused || isFormer(person));
                    return (
                      <span key={person.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${muted ? "text-muted-foreground line-through" : ""}`}>
                        {personName(person)}
                        {isNewHire(person, today) && <span className="text-xs text-info">· {t("groups.newHire")}</span>}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="flex items-center gap-1 text-sm text-muted-foreground"><X className="h-4 w-4" />{t("groups.noMembers")}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
