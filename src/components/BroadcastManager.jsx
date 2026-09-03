import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Bell, Check, ChevronDown, Image as ImageIcon, Paperclip, Send, Trash2, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";
import { compressImage } from "@/lib/ocr";

export default function BroadcastManager() {
  const t = useT();
  const { user } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [audience, setAudience] = useState("all");
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
      setAudience("all");
      setMessage(t("broadcast.sent"));
      await loadLog();
    } catch (e) {
      setMessage(e?.message || "Error");
    } finally {
      setSending(false);
    }
  }

  async function remove(b) {
    if (!window.confirm(t("broadcast.deleteConfirm"))) return;
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
              rows={3}
              placeholder={t("broadcast.messagePlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t("broadcast.pasteHint")}</p>
          </div>

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
                      <div className="truncate text-sm font-medium">{b.body}</div>
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
    </div>
  );
}
