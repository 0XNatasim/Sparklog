import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { ArrowDown, ArrowUp, Bell, BookmarkPlus, Check, ChevronDown, EyeOff, FileText, History, Image as ImageIcon, Paperclip, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companyDate } from "@/lib/company-time";
import { fetchGroups, groupsTargetIds, pendingNewHires } from "@/lib/employee-groups";
import { useT } from "@/lib/use-t";
import { notifyBroadcastPush, pushOutcome } from "@/lib/push";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import BroadcastAttachments, { EditedTag } from "@/components/BroadcastAttachments";
import BroadcastEditForm from "@/components/BroadcastEditForm";
import { MAX_BROADCAST_ATTACHMENTS, addPickedFiles, broadcastAttachmentColumns, broadcastAttachments, isPdfFile } from "@/lib/broadcast-attachments";
import { recipientState, recipientStatus } from "@/lib/broadcast-edit";
import { uploadBroadcastFiles } from "@/lib/broadcast-upload";
import { addTemplate, loadTemplates, moveTemplate, removeTemplate, resolveTemplates, saveTemplates } from "@/lib/broadcast-templates";

// Ready-made messages a manager can click to fill the message box (recipients are
// still chosen by hand). Managers can add, delete and reorder them; the list is
// kept on this device (see lib/broadcast-templates).
const BUILT_IN_TEMPLATES = [
  `📦 Inventaire complet en présentiel à votre entrepôt.
🗓 Date : ce vendredi
⏰ Heure : entre 6 h 30 et 7 h 00
📍 Lieu : votre entrepôt

🔹 Vous devez obligatoirement vous présenter avec :
• Tout le matériel Hilo en votre possession
• Les composantes défectueuses

👉 Merci d’essayer de récupérer votre matériel avant la date d’inventaire afin de limiter au maximum les transferts d’inventaire.

❗ Important :
Si vous n’êtes pas en mesure de vous présenter ou que vous ne travaillez pas vendredi, vous devez :
📅 Rapporter tout votre matériel à l’entrepôt le jeudi avant, ou à votre dernière journée de travail avant l’inventaire du mois.
📞 Appeler Marc-Antoine ou Mélanie pour les en informer.`,
  "🦺 Réunion santé & sécurité ce jeudi. Liens dans votre profil.",
  "🦺 Réunion santé & sécurité ce mardi. Liens dans votre profil.",
  `📱 Sparklog — comment entrer vos heures

✨ Utilisez « Remplir auto » : c'est plus rapide et vos heures concordent avec Field Service.

1️⃣ Dans Field Service, ouvrez l'ordre de travail, onglet « Bilan ».
2️⃣ Faites défiler jusqu'à « Distance réel parcourue (km) » et prenez une capture d'écran.
   La capture doit montrer le # OT, les heures de départ, d'arrivée et de fin, et les km.
3️⃣ Dans Sparklog, appuyez sur « Remplir auto » et choisissez la capture.
   ➜ L'OT, le Départ, l'Arrivée, la Fin et les KM se remplissent tout seuls.
4️⃣ Vérifiez que tout est exact, puis :
   • « Enregistrer » = brouillon, encore modifiable.
   • « Soumettre » = envoyé au gestionnaire pour approbation. Le job est alors verrouillé.

👉 Astuce : dans l'Historique, « SOUMETTRE LA JOURNÉE » envoie tous vos jobs enregistrés du jour d'un seul coup à la fin de la journée.`,
  `⏰ Rappel important — Soumission quotidienne

Vos heures doivent être SOUMISES chaque jour, avant la fin de la journée.
Un job seulement « enregistré » n'est pas envoyé : le gestionnaire ne le voit pas et il ne peut pas être payé.

❗ Une journée non soumise se verrouille. Il faudra alors demander au gestionnaire de la déverrouiller.

Merci de prendre 2 minutes à la fin de chaque journée. 🙏`,
  `📸 Temps supplémentaire (plus de 8 h dans la journée)

Au-delà de 8 h, Sparklog vous demande la capture d'écran du SMS qui autorise le temps supplémentaire.

La capture doit montrer :
✅ Le SMS d'approbation avec la date
✅ Votre réponse avec la durée (ex. : « 30 min »)

Sans cette capture, le temps supplémentaire ne peut pas être approuvé. Appuyez sur « Afficher l'exemple d'image » dans l'app pour voir un modèle.`,
  `✅ Vos obligations dans Sparklog

• Entrer TOUS vos jobs, avec l'heure de Départ, d'Arrivée et de Fin exactes.
• Soumettre vos heures CHAQUE JOUR.
• Plus de 8 h dans la journée ➜ joindre la capture du SMS d'autorisation.
• Stationnement payé ➜ cocher « Stationnement » et joindre la photo du reçu, avec le montant.
• Vérifier vos km avant de soumettre.`,
];

// Messages sent (newest first) and their recipients.
function fetchBroadcastLog() {
  return Promise.all([
    supabase.from("manager_broadcasts").select("id, body, audience, image_path, attachments, created_at, edited_at").order("created_at", { ascending: false }),
    supabase.from("broadcast_recipients").select("broadcast_id, employee_id, acknowledged_at, withdrawn_at"),
  ]);
}

export default function BroadcastManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { user } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [body, setBody] = useState("");
  // Pictures and PDFs to send with the message (migration 0096), each with its preview URL.
  const [files, setFiles] = useState([]); // [{ file, preview }]
  const [audience, setAudience] = useState("selected");
  const [templates, setTemplates] = useState(() => loadTemplates(BUILT_IN_TEMPLATES));
  const [selected, setSelected] = useState(new Set());
  // Groupes d'employés (0114): pick whole groups as recipients.
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  // « Envoyer aussi aux nouveaux en attente ? » — { people, resolve } while the question is open.
  const [newHireQuestion, setNewHireQuestion] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const [broadcasts, setBroadcasts] = useState([]);
  const [recipientsByBroadcast, setRecipientsByBroadcast] = useState(new Map());
  const [expanded, setExpanded] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [resendingId, setResendingId] = useState("");
  // How the phone push of the last send went (sent / nobody subscribed / refused), under the message.
  const [pushNote, setPushNote] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [withdrawingId, setWithdrawingId] = useState("");
  // Previous versions of edited messages (0107), loaded when a message is opened.
  const [revisionsById, setRevisionsById] = useState(new Map());


  function toggleGroup(id) {
    setSelectedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Resolves "include", "exclude" or null (cancel the send).
  const askAboutNewHires = (people) => new Promise((resolve) => setNewHireQuestion({ people, resolve }));
  function answerNewHires(value) {
    newHireQuestion?.resolve(value);
    setNewHireQuestion(null);
  }

  function addFiles(picked) {
    const list = [...(picked || [])];
    if (!list.length) return;
    const { files: kept, skipped } = addPickedFiles(files.map((f) => f.file), list);
    setMessage(skipped ? t("broadcast.filesSkipped", { count: skipped, max: MAX_BROADCAST_ATTACHMENTS }) : "");
    setFiles(kept.map((file) => files.find((f) => f.file === file)
      || { file, preview: isPdfFile(file) ? "" : URL.createObjectURL(file) }));
  }

  function pickFiles(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    addFiles(picked);
  }

  // Paste screenshots straight into the message box (Ctrl+V / right-click paste).
  function handlePaste(event) {
    const pasted = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (pasted.length) { event.preventDefault(); addFiles(pasted); }
  }

  // Drag pictures or PDFs onto the message box.
  function handleDrop(event) {
    const dropped = [...(event.dataTransfer?.files || [])];
    if (dropped.length) { event.preventDefault(); addFiles(dropped); }
  }

  function removeFile(index) {
    setFiles((current) => {
      const gone = current[index];
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return current.filter((_, i) => i !== index);
    });
  }

  function clearFiles() {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
  }

  function applyLog([{ data: rows }, { data: recips }]) {
    setBroadcasts(rows || []);
    const map = new Map();
    (recips || []).forEach((r) => {
      if (!map.has(r.broadcast_id)) map.set(r.broadcast_id, []);
      map.get(r.broadcast_id).push(r);
    });
    setRecipientsByBroadcast(map);
    setRevisionsById(new Map());
  }

  async function loadLog() {
    applyLog(await fetchBroadcastLog());
  }

  async function loadRevisions(id) {
    const { data } = await supabase
      .from("broadcast_revisions")
      .select("id, body, attachments, edited_at, reread, reread_count")
      .eq("broadcast_id", id)
      .order("edited_at", { ascending: false });
    setRevisionsById((current) => new Map(current).set(id, data || []));
  }

  function toggleOpen(b) {
    const open = expanded !== b.id;
    setExpanded(open ? b.id : "");
    if (open && b.edited_at && !revisionsById.has(b.id)) loadRevisions(b.id);
  }

  useEffect(() => {
    let alive = true;
    // Include managers too (a manager is a valid recipient / selectable target),
    // but never inactive (paused) accounts.
    supabase.from("profiles").select("id, full_name, email, is_paused, departure_status, start_date").order("full_name")
      .then(({ data }) => { if (alive) setEmployees((data || []).filter((employee) => !employee.is_paused)); });
    // Optional: without groups (or if they cannot be read) the « Groupes » choice is simply hidden.
    fetchGroups().then(
      (rows) => { if (alive) setGroups(rows); },
      (error) => console.warn("[broadcast] groups not loaded:", error),
    );
    fetchBroadcastLog().then((log) => { if (alive) applyLog(log); });
    return () => { alive = false; };
  }, []);

  function toggleEmployee(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function applyTemplate(text) {
    setBody(text);
    setMessage("");
  }

  function updateTemplates(items) {
    const next = { ...templates, items };
    setTemplates(next);
    saveTemplates(next);
  }

  function saveTemplate() {
    const text = body.trim();
    if (!text) { setMessage(t("broadcast.needMessage")); return; }
    if (templates.items.includes(text)) return;
    updateTemplates(addTemplate(templates.items, text));
    setMessage(t("broadcast.templateSaved"));
  }

  async function deleteTemplate(index) {
    if (!(await confirm(t("broadcast.deleteTemplateConfirm")))) return;
    updateTemplates(removeTemplate(templates.items, index));
  }

  async function restoreTemplates() {
    if (!(await confirm(t("broadcast.restoreTemplatesConfirm")))) return;
    // Built-ins back in their original order; the manager's own messages stay after them.
    const own = templates.items.filter((text) => !BUILT_IN_TEMPLATES.includes(text));
    const next = resolveTemplates(null, own, BUILT_IN_TEMPLATES);
    setTemplates(next);
    saveTemplates(next);
  }

  const employeeName = (id) => {
    const e = employees.find((row) => row.id === id);
    return e?.full_name || e?.email || id;
  };

  async function send() {
    setMessage("");
    setPushNote(null);
    if (!body.trim() && files.length === 0) { setMessage(t("broadcast.needMessage")); return; }
    let targetIds = audience === "all"
      ? employees.map((e) => e.id)
      : audience === "groups" ? groupsTargetIds(groups, [...selectedGroups], employees) : [...selected];
    if (targetIds.length === 0) { setMessage(t(audience === "groups" ? "broadcast.needGroups" : "broadcast.needEmployees")); return; }
    // « Tous » or a group can include new hires who have not started yet: ask (only when there are some).
    // A person ticked one by one in « Employés choisis » was chosen on purpose.
    if (audience !== "selected") {
      const waiting = pendingNewHires(employees, targetIds, companyDate());
      if (waiting.length) {
        const answer = await askAboutNewHires(waiting);
        if (!answer) return;
        if (answer === "exclude") {
          const skip = new Set(waiting.map((person) => person.id));
          targetIds = targetIds.filter((id) => !skip.has(id));
          if (targetIds.length === 0) { setMessage(t("broadcast.needEmployees")); return; }
        }
      }
    }

    setSending(true);
    try {
      const attachments = await uploadBroadcastFiles(files.map((f) => f.file));

      const { data: created, error: insertError } = await supabase
        .from("manager_broadcasts")
        // A group send is stored as « selected »: its recipients are listed one by one.
        .insert({ sender_id: user?.id, body: body.trim(), audience: audience === "groups" ? "selected" : audience, ...broadcastAttachmentColumns(attachments) })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const rows = targetIds.map((employee_id) => ({ broadcast_id: created.id, employee_id }));
      const { error: recipError } = await supabase.from("broadcast_recipients").insert(rows);
      if (recipError) throw recipError;
      // Phone push in the background; its outcome shows under the message when it is known.
      notifyBroadcastPush(created.id).then((result) => setPushNote(pushOutcome(result)));

      setBody("");
      clearFiles();
      setSelected(new Set());
      setSelectedGroups(new Set());
      setAudience("selected");
      setMessage(t("broadcast.sent"));
      await loadLog();
    } catch (e) {
      setMessage(e?.message || "Error");
    } finally {
      setSending(false);
    }
  }

  async function remove(b) {
    if (!(await confirm(t("broadcast.deleteConfirm")))) return;
    setMessage("");
    setDeletingId(b.id);
    try {
      // broadcast_recipients cascade-delete with the parent broadcast.
      const { error } = await supabase.from("manager_broadcasts").delete().eq("id", b.id);
      if (error) throw error;
      if (expanded === b.id) setExpanded("");
      setMessage(t("broadcast.deleted"));
      await loadLog();
    } catch (e) {
      setMessage(e?.message || "Error");
    } finally {
      setDeletingId("");
    }
  }

  async function resend(b) {
    setMessage("");
    setPushNote(null);
    setResendingId(b.id);
    try {
      // Re-send to the same recipients as the original broadcast, except those it was withdrawn from.
      const recips = (recipientsByBroadcast.get(b.id) || []).filter((r) => !r.withdrawn_at);
      let targetIds = recips.map((r) => r.employee_id);
      if (targetIds.length === 0 && b.audience === "all") targetIds = employees.map((e) => e.id);
      if (targetIds.length === 0) throw new Error(t("broadcast.needEmployees"));

      const { data: created, error: insertError } = await supabase
        .from("manager_broadcasts")
        .insert({ sender_id: user?.id, body: b.body, audience: b.audience, ...broadcastAttachmentColumns(broadcastAttachments(b)) })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const rows = targetIds.map((employee_id) => ({ broadcast_id: created.id, employee_id }));
      const { error: recipError } = await supabase.from("broadcast_recipients").insert(rows);
      if (recipError) throw recipError;
      notifyBroadcastPush(created.id).then((result) => setPushNote(pushOutcome(result)));

      setMessage(t("broadcast.resent"));
      await loadLog();
    } catch (e) {
      setMessage(e?.message || "Error");
    } finally {
      setResendingId("");
    }
  }

  // Withdraw the message from the recipients who have not pressed OK yet (0107); readers keep it.
  async function withdrawUnread(b, pending) {
    if (!(await confirm(t("broadcast.withdrawConfirm", { count: pending })))) return;
    setMessage("");
    setWithdrawingId(b.id);
    try {
      const { data, error } = await supabase.rpc("withdraw_broadcast_unread", { p_broadcast_id: b.id });
      if (error) throw error;
      setMessage(t("broadcast.withdrawn", { count: data ?? 0 }));
      await loadLog();
    } catch (e) {
      setMessage(e?.message || "Error");
    } finally {
      setWithdrawingId("");
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 font-semibold select-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><Bell className="h-4 w-4" />{t("broadcast.title")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t p-4">
          <p className="text-xs text-muted-foreground">{t("broadcast.description")}</p>
          {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}
          {pushNote && (
            <div
              role="status"
              className={pushNote.tone === "warning"
                ? "rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
                : pushNote.tone === "ok"
                  ? "rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
                  : "rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info"}
            >
              {t(pushNote.key, pushNote.params)}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">{t("broadcast.message")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              rows={body.split("\n").length > 3 ? 8 : 3}
              placeholder={t("broadcast.messagePlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t("broadcast.pasteHint")}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("broadcast.audience")}</span>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="audience" checked={audience === "all"} onChange={() => setAudience("all")} className="accent-primary" />
                {t("broadcast.audienceAll")}
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="audience" checked={audience === "selected"} onChange={() => setAudience("selected")} className="accent-primary" />
                {t("broadcast.audienceSelected")}
              </label>
              {groups.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="audience" checked={audience === "groups"} onChange={() => setAudience("groups")} className="accent-primary" />
                  {t("broadcast.audienceGroups")}
                </label>
              )}
            </div>
            {audience === "groups" && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {groups.map((group) => {
                  const count = groupsTargetIds(groups, [group.id], employees).length;
                  return (
                    <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={selectedGroups.has(group.id)} onChange={() => toggleGroup(group.id)} className="h-4 w-4 accent-primary" />
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t("broadcast.groupCount", { count })}</span>
                    </label>
                  );
                })}
                {selectedGroups.size > 0 && (
                  <p className="px-2 pt-1 text-xs text-muted-foreground">
                    {t("broadcast.groupsTotal", { count: groupsTargetIds(groups, [...selectedGroups], employees).length })}
                  </p>
                )}
              </div>
            )}
            {audience === "selected" && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {employees.map((employee) => (
                  <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selected.has(employee.id)} onChange={() => toggleEmployee(employee.id)} className="h-4 w-4 accent-primary" />
                    <span>{employee.full_name || employee.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("broadcast.templates")}</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={saveTemplate} title={t("broadcast.saveTemplate")}>
                <BookmarkPlus className="h-3.5 w-3.5" />{t("broadcast.saveTemplate")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("broadcast.templatesHint")}</p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {templates.items.length === 0 && <p className="text-xs text-muted-foreground">{t("broadcast.noTemplates")}</p>}
              {templates.items.map((text, index) => (
                <div key={`${index}-${text.slice(0, 20)}`} className={`flex items-stretch rounded-md border text-sm ${body === text ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}>
                  <button type="button" onClick={() => applyTemplate(text)} className="min-w-0 flex-1 px-3 py-2 text-left" title={text}>
                    <span className="line-clamp-2 whitespace-pre-line">{text}</span>
                  </button>
                  <div className="flex shrink-0 items-center border-l px-0.5">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => updateTemplates(moveTemplate(templates.items, index, -1))} title={t("broadcast.moveTemplateUp")} aria-label={t("broadcast.moveTemplateUp")}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === templates.items.length - 1} onClick={() => updateTemplates(moveTemplate(templates.items, index, 1))} title={t("broadcast.moveTemplateDown")} aria-label={t("broadcast.moveTemplateDown")}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteTemplate(index)} title={t("broadcast.deleteTemplate")} aria-label={t("broadcast.deleteTemplate")}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={restoreTemplates} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
              <RotateCcw className="h-3 w-3" />{t("broadcast.restoreTemplates")}
            </button>
          </div>
          </div>

          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <Paperclip className="h-4 w-4" />{t("broadcast.attachFiles")}
              <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={pickFiles} className="hidden" />
            </label>
            <div className="text-xs text-muted-foreground">{t("broadcast.attachHint", { max: MAX_BROADCAST_ATTACHMENTS })}</div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {files.map(({ file, preview }, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="relative w-fit">
                    {preview
                      ? <img src={preview} alt="" className="h-24 max-w-[10rem] rounded-md border object-contain" />
                      : (
                        <div className="flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-md border px-2 text-center text-xs">
                          <FileText className="h-6 w-6 text-destructive" aria-hidden="true" />
                          <span className="w-full truncate">{file.name || "PDF"}</span>
                        </div>
                      )}
                    <button type="button" onClick={() => removeFile(index)} className="absolute -right-2 -top-2 rounded-full border bg-background p-0.5 shadow" aria-label={t("broadcast.removeFile")}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="button" disabled={sending} onClick={send}>{sending ? t("broadcast.sending") : t("broadcast.send")}</Button>
          </div>
        </details>
      </Card>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
            <span>{t("broadcast.log")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t p-4">
          {broadcasts.length === 0 && <p className="text-xs text-muted-foreground">{t("broadcast.noLog")}</p>}
          {broadcasts.map((b) => {
            const recips = recipientsByBroadcast.get(b.id) || [];
            const status = recipientStatus(recips);
            const isOpen = expanded === b.id;
            const isEditing = editingId === b.id;
            const busyRow = resendingId === b.id || deletingId === b.id || withdrawingId === b.id;
            const revisions = revisionsById.get(b.id) || [];
            return (
              <div key={b.id} className="rounded-lg border">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleOpen(b)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-l-lg p-3 text-left hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${isOpen ? "whitespace-pre-wrap break-words" : "truncate"}`}>{b.body}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {broadcastAttachments(b).some((a) => a.kind !== "pdf") && <ImageIcon className="h-3.5 w-3.5" />}
                        {broadcastAttachments(b).some((a) => a.kind === "pdf") && <FileText className="h-3.5 w-3.5" />}
                        {dayjs(b.created_at).format("DD MMM YYYY HH:mm")} · {b.audience === "all" ? t("broadcast.everyone") : t("broadcast.audienceSelected")}
                        {b.edited_at && <EditedTag at={b.edited_at} />}
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                      {t("broadcast.viewedCount", { acked: status.acked, total: status.total })}
                      {status.withdrawn > 0 && <span className="text-warning">· {t("broadcast.withdrawnCount", { count: status.withdrawn })}</span>}
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 border-l px-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("broadcast.edit")}
                      aria-label={t("broadcast.edit")}
                      aria-pressed={isEditing}
                      disabled={busyRow}
                      onClick={() => setEditingId(isEditing ? "" : b.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("broadcast.withdraw")}
                      aria-label={t("broadcast.withdraw")}
                      disabled={busyRow || status.pending === 0}
                      onClick={() => withdrawUnread(b, status.pending)}
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("broadcast.resend")}
                      aria-label={t("broadcast.resend")}
                      disabled={busyRow}
                      onClick={() => resend(b)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title={t("broadcast.delete")}
                      aria-label={t("broadcast.delete")}
                      disabled={busyRow}
                      onClick={() => remove(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {isEditing && (
                  <BroadcastEditForm
                    broadcast={b}
                    recipients={recips}
                    onCancel={() => setEditingId("")}
                    onSaved={async (text) => { setEditingId(""); setMessage(text); await loadLog(); }}
                  />
                )}
                {isOpen && (
                  <div className="border-t p-3">
                    {broadcastAttachments(b).length > 0 && <div className="mb-3 max-w-md"><BroadcastAttachments broadcast={b} imageClassName="max-h-48 w-auto" /></div>}
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("broadcast.recipients")}</div>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {recips.map((r) => (
                        <div key={r.employee_id} className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-2 py-1.5 text-xs">
                          <span>{employeeName(r.employee_id)}</span>
                          {recipientState(r) === "read" && <span className="flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" />{t("broadcast.viewed")} · {dayjs(r.acknowledged_at).format("DD MMM HH:mm")}</span>}
                          {recipientState(r) === "pending" && <span className="text-muted-foreground">{t("broadcast.notViewed")}</span>}
                          {recipientState(r) === "withdrawn" && <span className="flex items-center gap-1 text-warning"><EyeOff className="h-3.5 w-3.5" />{t("broadcast.withdrawnAt", { date: dayjs(r.withdrawn_at).format("DD MMM HH:mm") })}</span>}
                        </div>
                      ))}
                    </div>
                    {revisions.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><History className="h-3.5 w-3.5" />{t("broadcast.previousVersions")}</div>
                        <div className="space-y-2">
                          {revisions.map((rev) => (
                            <div key={rev.id} className="rounded border border-dashed px-2 py-1.5 text-xs">
                              <div className="text-muted-foreground">
                                {t("broadcast.replacedAt", { date: dayjs(rev.edited_at).format("DD MMM YYYY HH:mm") })}
                                {rev.reread && ` · ${t("broadcast.rereadAsked", { count: rev.reread_count })}`}
                                {broadcastAttachments(rev).length > 0 && ` · ${t("broadcast.attachmentCount", { count: broadcastAttachments(rev).length })}`}
                              </div>
                              {rev.body && <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{rev.body}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </details>
      </Card>
      {confirmDialog}
      <Dialog open={Boolean(newHireQuestion)} onOpenChange={(open) => { if (!open) answerNewHires(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">{t("broadcast.newHiresTitle", { count: newHireQuestion?.people.length || 0 })}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {(newHireQuestion?.people || []).map((person) => (
              <li key={person.id}>
                <span className="font-medium">{person.full_name || person.email}</span>
                <span className="text-muted-foreground"> · {t("broadcast.newHireStarts", { date: dayjs(person.start_date).format("YYYY-MM-DD") })}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("broadcast.newHiresHint")}</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => answerNewHires(null)}>{t("common.cancel")}</Button>
            <Button type="button" variant="outline" onClick={() => answerNewHires("exclude")}>{t("broadcast.newHiresExclude")}</Button>
            <Button type="button" onClick={() => answerNewHires("include")}>{t("broadcast.newHiresInclude")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
