import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { ArrowDown, ArrowUp, Bell, BookmarkPlus, Check, ChevronDown, Image as ImageIcon, Paperclip, RotateCcw, Send, Trash2, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { compressImage } from "@/lib/ocr";
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
// Signed thumbnail for a sent broadcast's screenshot (private bucket).
function BroadcastImage({ path }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    supabase.storage.from("broadcast-images").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl || "");
    });
    return () => { alive = false; };
  }, [path]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
      <img src={url} alt="" className="max-h-48 rounded-md border object-contain" />
    </a>
  );
}

export default function BroadcastManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { user } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [audience, setAudience] = useState("selected");
  const [templates, setTemplates] = useState(() => loadTemplates(BUILT_IN_TEMPLATES));
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const [broadcasts, setBroadcasts] = useState([]);
  const [recipientsByBroadcast, setRecipientsByBroadcast] = useState(new Map());
  const [expanded, setExpanded] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [resendingId, setResendingId] = useState("");

  async function loadEmployees() {
    // Include managers too (a manager is a valid recipient / selectable target),
    // but never inactive (paused) accounts.
    const { data } = await supabase
      .from("profiles").select("id, full_name, email, is_paused").order("full_name");
    setEmployees((data || []).filter((employee) => !employee.is_paused));
  }

  function setPickedImage(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function pickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPickedImage(file);
  }

  // Paste a screenshot straight into the message box (Ctrl+V / right-click paste).
  function handlePaste(event) {
    const items = event.clipboardData?.items || [];
    for (const item of items) {
      if (item.type?.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { event.preventDefault(); setPickedImage(file); }
        return;
      }
    }
  }

  // Drag an image file onto the message box.
  function handleDrop(event) {
    const file = [...(event.dataTransfer?.files || [])].find((f) => f.type?.startsWith("image/"));
    if (file) { event.preventDefault(); setPickedImage(file); }
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
  }

  async function loadLog() {
    const [{ data: rows }, { data: recips }] = await Promise.all([
      supabase.from("manager_broadcasts").select("id, body, audience, image_path, created_at").order("created_at", { ascending: false }),
      supabase.from("broadcast_recipients").select("broadcast_id, employee_id, acknowledged_at"),
    ]);
    setBroadcasts(rows || []);
    const map = new Map();
    (recips || []).forEach((r) => {
      if (!map.has(r.broadcast_id)) map.set(r.broadcast_id, []);
      map.get(r.broadcast_id).push(r);
    });
    setRecipientsByBroadcast(map);
  }

  useEffect(() => { loadEmployees(); loadLog(); }, []);

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
    if (!body.trim() && !imageFile) { setMessage(t("broadcast.needMessage")); return; }
    const targetIds = audience === "all" ? employees.map((e) => e.id) : [...selected];
    if (targetIds.length === 0) { setMessage(t("broadcast.needEmployees")); return; }

    setSending(true);
    try {
      let imagePath = null;
      if (imageFile) {
        const blob = await compressImage(imageFile);
        const path = `${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("broadcast-images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        imagePath = path;
      }

      const { data: created, error: insertError } = await supabase
        .from("manager_broadcasts")
        .insert({ sender_id: user?.id, body: body.trim(), audience, image_path: imagePath })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const rows = targetIds.map((employee_id) => ({ broadcast_id: created.id, employee_id }));
      const { error: recipError } = await supabase.from("broadcast_recipients").insert(rows);
      if (recipError) throw recipError;

      setBody("");
      clearImage();
      setSelected(new Set());
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
    setResendingId(b.id);
    try {
      // Re-send to exactly the same recipients as the original broadcast.
      const recips = recipientsByBroadcast.get(b.id) || [];
      let targetIds = recips.map((r) => r.employee_id);
      if (targetIds.length === 0 && b.audience === "all") targetIds = employees.map((e) => e.id);
      if (targetIds.length === 0) throw new Error(t("broadcast.needEmployees"));

      const { data: created, error: insertError } = await supabase
        .from("manager_broadcasts")
        .insert({ sender_id: user?.id, body: b.body, audience: b.audience, image_path: b.image_path || null })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const rows = targetIds.map((employee_id) => ({ broadcast_id: created.id, employee_id }));
      const { error: recipError } = await supabase.from("broadcast_recipients").insert(rows);
      if (recipError) throw recipError;

      setMessage(t("broadcast.resent"));
      await loadLog();
    } catch (e) {
      setMessage(e?.message || "Error");
    } finally {
      setResendingId("");
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
            </div>
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
              <Paperclip className="h-4 w-4" />{t("broadcast.attachImage")}
              <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </label>
            {imagePreview && (
              <div className="relative w-fit">
                <img src={imagePreview} alt="" className="max-h-40 rounded-md border object-contain" />
                <button type="button" onClick={clearImage} className="absolute -right-2 -top-2 rounded-full border bg-background p-0.5 shadow" aria-label={t("broadcast.removeImage")}>
                  <X className="h-3.5 w-3.5" />
                </button>
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
            const acked = recips.filter((r) => r.acknowledged_at).length;
            const isOpen = expanded === b.id;
            return (
              <div key={b.id} className="rounded-lg border">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? "" : b.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-l-lg p-3 text-left hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${isOpen ? "whitespace-pre-wrap break-words" : "truncate"}`}>{b.body}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {b.image_path && <ImageIcon className="h-3.5 w-3.5" />}
                        {dayjs(b.created_at).format("DD MMM YYYY HH:mm")} · {b.audience === "all" ? t("broadcast.everyone") : t("broadcast.audienceSelected")}
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                      {t("broadcast.viewedCount", { acked, total: recips.length })}
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 border-l px-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("broadcast.resend")}
                      aria-label={t("broadcast.resend")}
                      disabled={resendingId === b.id || deletingId === b.id}
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
                      disabled={deletingId === b.id || resendingId === b.id}
                      onClick={() => remove(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t p-3">
                    {b.image_path && <div className="mb-3"><BroadcastImage path={b.image_path} /></div>}
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("broadcast.recipients")}</div>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {recips.map((r) => (
                        <div key={r.employee_id} className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-2 py-1.5 text-xs">
                          <span>{employeeName(r.employee_id)}</span>
                          {r.acknowledged_at
                            ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />{t("broadcast.viewed")} · {dayjs(r.acknowledged_at).format("DD MMM HH:mm")}</span>
                            : <span className="text-muted-foreground">{t("broadcast.notViewed")}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </details>
      </Card>
      {confirmDialog}
    </div>
  );
}
