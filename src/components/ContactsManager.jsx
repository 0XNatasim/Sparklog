import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Mail, Pencil, Phone, Plus, Trash2, UsersRound, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { MAX_DESCRIPTION, MAX_ROLE_LENGTH, MAX_TITLE, REFERENCE_BUCKET, blockFilePaths, contactRoleLabel, phoneHref } from "@/lib/reference-blocks";
import { CONTACTS_SECTION, availableRoles, contactIsEmpty, contactSections, emptyContact, hasRole, moveContact, removeContact, saveContact, sectionContacts } from "@/lib/contacts";
import { moveItem, nextSortOrder } from "@/lib/sort-order";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";

const check = ({ error }) => { if (error) throw error; };

// One person: name, title, phone, email, note and roles (base list + the manager's own).
function ContactForm({ initial, roles, sectionTitle, onSave, onCancel, busy }) {
  const t = useT();
  const [contact, setContact] = useState(() => ({ ...emptyContact(), ...initial, roles: [...(initial?.roles || [])] }));
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const set = (key) => (event) => setContact((current) => ({ ...current, [key]: event.target.value }));
  const toggleRole = (role) => setContact((current) => ({
    ...current,
    roles: current.roles.includes(role) ? current.roles.filter((r) => r !== role) : [...current.roles, role],
  }));
  const choices = [...roles, ...contact.roles.filter((r) => !roles.includes(r))];

  function addCustom() {
    const value = custom.trim().replace(/\s+/g, " ");
    if (!value) return;
    const existing = choices.find((r) => r.toLowerCase() === value.toLowerCase() || contactRoleLabel(r, t).toLowerCase() === value.toLowerCase());
    setContact((current) => ({ ...current, roles: current.roles.includes(existing || value) ? current.roles : [...current.roles, existing || value] }));
    setCustom("");
  }

  function submit() {
    if (sectionTitle === null && !title.trim()) { setError(t("contacts.errors.sectionName")); return; }
    if (contactIsEmpty(contact)) { setError(t("contacts.errors.empty")); return; }
    setError("");
    onSave(contact, title.trim());
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      {sectionTitle === null && (
        <Input value={title} maxLength={MAX_TITLE} placeholder={t("contacts.sectionName")} aria-label={t("contacts.sectionName")} onChange={(event) => setTitle(event.target.value)} />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={contact.name} maxLength={MAX_TITLE} placeholder={t("ref.contact.name")} aria-label={t("ref.contact.name")} onChange={set("name")} />
        <Input value={contact.role} maxLength={MAX_TITLE} placeholder={t("contacts.title")} aria-label={t("contacts.title")} onChange={set("role")} />
        <Input value={contact.phone} inputMode="tel" maxLength={40} placeholder={t("ref.contact.phone")} aria-label={t("ref.contact.phone")} onChange={set("phone")} />
        <Input value={contact.email} inputMode="email" maxLength={200} placeholder={t("ref.contact.email")} aria-label={t("ref.contact.email")} onChange={set("email")} />
        <Input className="sm:col-span-2" value={contact.note} maxLength={MAX_DESCRIPTION} placeholder={t("ref.contact.note")} aria-label={t("ref.contact.note")} onChange={set("note")} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">{t("contacts.roles")}</div>
        <div className="flex flex-wrap gap-1.5">
          {choices.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={contact.roles.includes(role)}
              onClick={() => toggleRole(role)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${contact.roles.includes(role) ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent"}`}
            >
              {contactRoleLabel(role, t)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:max-w-sm">
          <Input
            value={custom}
            maxLength={MAX_ROLE_LENGTH}
            placeholder={t("contacts.customRole")}
            aria-label={t("contacts.customRole")}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }}
            className="h-9"
          />
          <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom.trim()}>{t("contacts.addRole")}</Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={submit}>{busy ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}

function RoleChips({ roles }) {
  const t = useT();
  if (!roles?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {roles.map((role) => <span key={role} className="rounded-full bg-info/15 px-2 py-0.5 text-xs font-medium text-info">{contactRoleLabel(role, t)}</span>)}
    </div>
  );
}

// Configuration › Contacts: the people employees see in Profil › Contacts, by section (Britton,
// HILO…), each with roles (who to call for what). Same rows as Références › Contacts.
export default function ContactsManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // { refId, index } editing a contact (index null = new contact), { refId: null } = new section.
  const [editing, setEditing] = useState(null);
  const [renaming, setRenaming] = useState(null); // { refId, title }
  const [roleFilter, setRoleFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const { data, error: loadError } = await withTimeout(
        supabase.from("profile_references")
          .select("id, section, title, description, blocks, published, sort_order, created_at")
          .eq("section", CONTACTS_SECTION)
          .order("sort_order").order("created_at")
          .limit(QUERY_BUDGETS.profileReferences),
        15000
      );
      if (loadError) throw loadError;
      setReferences(data || []);
    } catch (loadError) {
      setError(friendlyErrorMessage(loadError, t, "ref.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const sections = useMemo(() => contactSections(references), [references]);
  const roles = useMemo(() => availableRoles(references), [references]);

  async function run(key, action, okMessage) {
    if (busy) return false;
    setBusy(key);
    setError("");
    setInfo("");
    try {
      await action();
      if (okMessage) setInfo(okMessage);
      await load();
      return true;
    } catch (actionError) {
      setError(friendlyErrorMessage(actionError, t, "ref.errors.save"));
      return false;
    } finally {
      setBusy("");
    }
  }

  const updateBlocks = (ref, blocks) => withTimeout(supabase.from("profile_references").update({ blocks }).eq("id", ref.id), 15000).then(check);

  async function saveEdited(contact, sectionTitle) {
    const { refId, index } = editing;
    const ok = refId
      ? await run("save", () => updateBlocks(references.find((r) => r.id === refId), saveContact(references.find((r) => r.id === refId).blocks, index, contact)), t("contacts.saved"))
      : await run("save", () => withTimeout(supabase.from("profile_references").insert({
        id: crypto.randomUUID(),
        section: CONTACTS_SECTION,
        title: sectionTitle,
        description: null,
        published: true,
        blocks: saveContact([], null, contact),
        sort_order: nextSortOrder(sections),
      }), 15000).then(check), t("contacts.sectionAdded"));
    if (ok) setEditing(null);
  }

  async function deleteContact(ref, index, contact) {
    const others = (ref.blocks || []).filter((_, i) => i !== index);
    const lastOne = others.length === 0;
    const question = lastOne
      ? t("contacts.deleteLastConfirm", { name: contact.name || contact.phone || contact.email, section: ref.title })
      : t("contacts.deleteConfirm", { name: contact.name || contact.phone || contact.email, section: ref.title });
    if (!(await confirm(question))) return;
    if (lastOne) {
      await run(`del-${ref.id}`, () => withTimeout(supabase.from("profile_references").delete().eq("id", ref.id), 12000).then(check), t("contacts.sectionDeleted"));
      return;
    }
    await run(`del-${ref.id}-${index}`, () => updateBlocks(ref, removeContact(ref.blocks, index)), t("contacts.deleted"));
  }

  async function moveOne(ref, index, delta) {
    const blocks = moveContact(ref.blocks, index, delta);
    if (blocks) await run(`move-${ref.id}`, () => updateBlocks(ref, blocks));
  }

  async function moveSection(position, delta) {
    const changes = moveItem(sections, position, delta);
    if (!changes.length) return;
    await run("order", async () => {
      const results = await withTimeout(Promise.all(changes.map((change) => supabase.from("profile_references").update({ sort_order: change.sort_order }).eq("id", change.id))), 12000);
      results.forEach(check);
    });
  }

  async function rename() {
    const title = renaming.title.trim();
    if (!title) { setError(t("contacts.errors.sectionName")); return; }
    const ok = await run(`rename-${renaming.refId}`, () => withTimeout(supabase.from("profile_references").update({ title }).eq("id", renaming.refId), 12000).then(check));
    if (ok) setRenaming(null);
  }

  async function togglePublished(ref) {
    await run(`pub-${ref.id}`, () => withTimeout(supabase.from("profile_references").update({ published: !ref.published }).eq("id", ref.id), 12000).then(check));
  }

  async function deleteSection(ref) {
    const count = sectionContacts(ref).length;
    if (!(await confirm(t("contacts.deleteSectionConfirm", { section: ref.title, count })))) return;
    const ok = await run(`del-${ref.id}`, () => withTimeout(supabase.from("profile_references").delete().eq("id", ref.id), 12000).then(check), t("contacts.sectionDeleted"));
    const files = blockFilePaths(ref.blocks);
    if (ok && files.length) await supabase.storage.from(REFERENCE_BUCKET).remove(files).catch(() => undefined);
  }

  const shownSections = roleFilter
    ? sections.filter((ref) => sectionContacts(ref).some(({ contact }) => hasRole(contact, roleFilter)))
    : sections;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {confirmDialog}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold"><UsersRound className="h-5 w-5 text-primary" />{t("contacts.pageTitle")}</div>
            <div className="flex items-center gap-2">
              <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label={t("contacts.filter")} className="h-9">
                <option value="">{t("contacts.allRoles")}</option>
                {roles.map((role) => <option key={role} value={role}>{contactRoleLabel(role, t)}</option>)}
              </Select>
              <Button type="button" size="sm" disabled={Boolean(busy) || editing?.refId === null} onClick={() => setEditing({ refId: null, index: null })}>
                <Plus className="mr-1 h-4 w-4" />{t("contacts.addSection")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("contacts.hint")}</p>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
          {info && <div className="rounded-md bg-success/10 p-3 text-sm text-success">{info}</div>}
          {editing?.refId === null && (
            <ContactForm initial={null} roles={roles} sectionTitle={null} busy={busy === "save"} onSave={saveEdited} onCancel={() => setEditing(null)} />
          )}
        </CardContent>
      </Card>

      {loading && <p className="p-2 text-sm text-muted-foreground">{t("common.working")}</p>}
      {!loading && shownSections.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">{roleFilter ? t("contacts.noneWithRole") : t("contacts.empty")}</p>
      )}

      {shownSections.map((ref) => {
        const position = sections.indexOf(ref);
        const people = sectionContacts(ref);
        const shown = roleFilter ? people.filter(({ contact }) => hasRole(contact, roleFilter)) : people;
        return (
          <Card key={ref.id}>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                {renaming?.refId === ref.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input value={renaming.title} maxLength={MAX_TITLE} aria-label={t("contacts.sectionName")} onChange={(event) => setRenaming({ refId: ref.id, title: event.target.value })} className="h-9" />
                    <Button type="button" size="sm" disabled={Boolean(busy)} onClick={rename}>{t("common.save")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)} aria-label={t("common.cancel")}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 font-semibold">
                    {ref.title}
                    <span className="text-xs font-normal text-muted-foreground">({people.length})</span>
                    {!ref.published && <Badge variant="secondary">{t("ref.hidden")}</Badge>}
                  </div>
                )}
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy) || roleFilter !== "" || position === 0} aria-label={t("common.moveUp")} onClick={() => moveSection(position, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy) || roleFilter !== "" || position === sections.length - 1} aria-label={t("common.moveDown")} onClick={() => moveSection(position, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy)} aria-label={t("contacts.renameSection")} title={t("contacts.renameSection")} onClick={() => setRenaming({ refId: ref.id, title: ref.title })}><Pencil className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy)} aria-label={ref.published ? t("ref.hide") : t("ref.publish")} title={ref.published ? t("ref.hide") : t("ref.publish")} onClick={() => togglePublished(ref)}>{ref.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" disabled={Boolean(busy)} aria-label={t("contacts.deleteSection")} title={t("contacts.deleteSection")} onClick={() => deleteSection(ref)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="divide-y">
                {shown.map(({ index, contact }, order) => (
                  <div key={index} className="px-4 py-2.5">
                    {editing?.refId === ref.id && editing.index === index ? (
                      <ContactForm initial={contact} roles={roles} sectionTitle={ref.title} busy={busy === "save"} onSave={saveEdited} onCancel={() => setEditing(null)} />
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm">
                          <div className="font-medium">
                            {contact.name || "—"}
                            {contact.role && <span className="ml-2 text-xs font-normal text-muted-foreground">{contact.role}</span>}
                          </div>
                          <RoleChips roles={contact.roles} />
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {contact.phone && <a href={phoneHref(contact.phone) || undefined} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" />{contact.phone}</a>}
                            {contact.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{contact.email}</span>}
                          </div>
                          {contact.note && <p className="mt-1 text-xs text-muted-foreground">{contact.note}</p>}
                        </div>
                        <div className="flex shrink-0 items-center">
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy) || roleFilter !== "" || order === 0} aria-label={t("common.moveUp")} onClick={() => moveOne(ref, index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy) || roleFilter !== "" || order === shown.length - 1} aria-label={t("common.moveDown")} onClick={() => moveOne(ref, index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy)} aria-label={t("contacts.edit")} title={t("contacts.edit")} onClick={() => setEditing({ refId: ref.id, index })}><Pencil className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" disabled={Boolean(busy)} aria-label={t("contacts.delete")} title={t("contacts.delete")} onClick={() => deleteContact(ref, index, contact)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {editing?.refId === ref.id && editing.index === null && (
                  <div className="px-4 py-2.5">
                    <ContactForm initial={null} roles={roles} sectionTitle={ref.title} busy={busy === "save"} onSave={saveEdited} onCancel={() => setEditing(null)} />
                  </div>
                )}
              </div>
              {!(editing?.refId === ref.id && editing.index === null) && (
                <div className="border-t px-4 py-2">
                  <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setEditing({ refId: ref.id, index: null })}>
                    <Plus className="mr-1 h-4 w-4" />{t("contacts.addContact")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
