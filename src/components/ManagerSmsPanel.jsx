import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Search, Send, Users, Eye, Loader2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const MAX_LEN = 500;

// GSM-7 approximation matching the edge function: 160 for a single segment,
// 153 per part once concatenated.
function segmentsFor(text) {
  const len = [...(text || "")].length;
  if (len === 0) return 0;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

function fmtPhone(raw) {
  if (!raw) return "—";
  const d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

const STATUS_STYLES = {
  sent:      "bg-green-500/15 text-green-600 dark:text-green-400",
  delivered: "bg-green-500/15 text-green-600 dark:text-green-400",
  partial:   "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sending:   "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  queued:    "bg-muted text-muted-foreground",
  skipped:   "bg-muted text-muted-foreground",
  failed:    "bg-destructive/15 text-destructive",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

export default function ManagerSmsPanel() {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.id ?? null;

  // ── Composer state ──
  const [body, setBody]           = useState("");
  const [mode, setMode]           = useState("all"); // "all" | "selected"
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState(() => new Set());
  const [sending, setSending]     = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── Data ──
  const [employees, setEmployees] = useState([]);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [history, setHistory]     = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [err, setErr]             = useState("");

  // ── Details modal ──
  const [detail, setDetail]       = useState(null); // { message, recipients }
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadEmployees() {
    setLoadingEmp(true);
    try {
      const { data, error } = await withTimeout(
        supabase.from("profiles")
          .select("id, full_name, phone, role")
          .order("full_name", { ascending: true }),
        12000,
      );
      if (error) throw error;
      // Exclude the sender — a manager shouldn't SMS themselves.
      setEmployees((data ?? []).filter((p) => p.id !== meId));
    } catch (e) {
      setErr(e?.message ?? "Failed to load employees.");
    } finally {
      setLoadingEmp(false);
    }
  }

  async function loadHistory() {
    setLoadingHist(true);
    try {
      const { data, error } = await withTimeout(
        supabase.from("messages")
          .select("id, sender_name, body, recipient_count, segment_count, provider, status, created_at, sent_at")
          .order("created_at", { ascending: false })
          .limit(50),
        12000,
      );
      if (error) throw error;
      setHistory(data ?? []);
    } catch (e) {
      setErr(e?.message ?? "Failed to load history.");
    } finally {
      setLoadingHist(false);
    }
  }

  useEffect(() => { loadEmployees(); }, [meId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadHistory(); }, []);

  // Employees carrying a phone number are the sendable set.
  const withPhone = useMemo(() => employees.filter((e) => e.phone), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      (e.full_name || "").toLowerCase().includes(q) ||
      String(e.phone || "").toLowerCase().includes(q));
  }, [employees, search]);

  const recipientCount = mode === "all" ? withPhone.length : selected.size;
  const segments = segmentsFor(body);
  const estimatedSms = recipientCount * segments;
  const overLimit = [...body].length > MAX_LEN;
  const canSend = body.trim().length > 0 && !overLimit && recipientCount > 0 && !sending;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((e) => { if (e.phone) next.add(e.id); });
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }

  async function doSend() {
    setSending(true);
    setErr("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No session — please log in again.");

      const payload = mode === "all"
        ? { body: body.trim(), allEmployees: true }
        : { body: body.trim(), recipientIds: [...selected] };

      const { data, error } = await withTimeout(
        supabase.functions.invoke("send_sms", {
          body: payload,
          headers: { Authorization: `Bearer ${token}` },
        }),
        30000,
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Send failed.");

      // Reset composer and refresh history.
      setBody("");
      setSelected(new Set());
      setMode("all");
      setConfirmOpen(false);
      await loadHistory();
    } catch (e) {
      setErr(e?.message ?? "Send failed.");
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  async function openDetails(message) {
    setDetail({ message, recipients: null });
    setDetailLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.from("message_recipients")
          .select("id, name, phone, delivery_status, delivered_at, error")
          .eq("message_id", message.id)
          .order("name", { ascending: true }),
        12000,
      );
      if (error) throw error;
      setDetail({ message, recipients: data ?? [] });
    } catch (e) {
      setErr(e?.message ?? "Failed to load recipients.");
      setDetail({ message, recipients: [] });
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
          <span>{err}</span>
          <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={() => { setErr(""); loadEmployees(); loadHistory(); }}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {/* ── Composer ── */}
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("sms.title")}</h3>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("sms.message")}
              </label>
              <span className={`text-xs tabular-nums ${overLimit ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                {[...body].length} / {MAX_LEN}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={MAX_LEN + 50}
              placeholder={t("sms.placeholder")}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
          </div>

          {/* Recipients */}
          <div className="space-y-2.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("sms.recipients")}
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sms-mode" checked={mode === "all"} onChange={() => setMode("all")} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                {t("sms.allEmployees")}
                <span className="text-xs text-muted-foreground">({withPhone.length})</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sms-mode" checked={mode === "selected"} onChange={() => setMode("selected")} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                {t("sms.selectedEmployees")}
              </label>
            </div>

            {mode === "selected" && (
              <div className="rounded-md border">
                <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
                  <div className="relative flex-1 min-w-[10rem]">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("sms.search")}
                      className="h-9 pl-8"
                    />
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={selectAllVisible}>{t("sms.selectAll")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>{t("sms.clear")}</Button>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y">
                  {loadingEmp && (
                    <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                  )}
                  {!loadingEmp && filtered.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">—</div>
                  )}
                  {!loadingEmp && filtered.map((e) => {
                    const noPhone = !e.phone;
                    return (
                      <label
                        key={e.id}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm ${noPhone ? "opacity-50" : "cursor-pointer hover:bg-muted/40"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={noPhone}
                          checked={selected.has(e.id)}
                          onChange={() => toggle(e.id)}
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                        <span className="flex-1 font-medium">{e.full_name || "—"}</span>
                        <span className="text-muted-foreground">{noPhone ? t("sms.noPhone") : fmtPhone(e.phone)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("sms.previewRecipients")}</span>
              <span className="font-semibold">{recipientCount} {t("sms.employees")}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">{t("sms.previewCount")}</span>
              <span className="font-semibold tabular-nums">
                {estimatedSms}{segments > 1 ? ` (${segments}×)` : ""}
              </span>
            </div>
          </div>

          {/* Send */}
          <div className="flex justify-end">
            <Button type="button" disabled={!canSend} onClick={() => setConfirmOpen(true)} className="gap-2">
              <Send className="h-4 w-4" /> {t("sms.send")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── History ── */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold">{t("sms.history")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t("sms.tbl.datetime")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("sms.tbl.sentBy")}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t("sms.tbl.count")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("sms.tbl.status")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("sms.tbl.preview")}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t("sms.tbl.details")}</th>
                </tr>
              </thead>
              <tbody>
                {loadingHist && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</td></tr>
                )}
                {!loadingHist && history.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">{t("sms.empty")}</td></tr>
                )}
                {!loadingHist && history.map((m) => (
                  <tr key={m.id} className="border-b last:border-b-0 hover:bg-muted/20 cursor-pointer" onClick={() => openDetails(m)}>
                    <td className="px-4 py-3 whitespace-nowrap">{dayjs(m.created_at).format("YYYY-MM-DD HH:mm")}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{m.sender_name || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.recipient_count}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3 max-w-[16rem] truncate text-muted-foreground">{m.body}</td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(ev) => { ev.stopPropagation(); openDetails(m); }} aria-label={t("sms.tbl.details")}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Confirmation dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sms.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("sms.confirmBody", { count: recipientCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
            {body}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>{t("common.cancel")}</Button>
            <Button onClick={doSend} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("sms.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Details modal ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{t("sms.detailTitle")}</DialogTitle>
                <DialogDescription>
                  {dayjs(detail.message.created_at).format("YYYY-MM-DD HH:mm")} · {detail.message.sender_name || "—"} · {detail.message.provider || "mock"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{t("sms.message")}</div>
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">{detail.message.body}</div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("sms.recipientList")} ({detail.message.recipient_count})
                    </div>
                    <StatusBadge status={detail.message.status} />
                  </div>
                  <div className="rounded-md border max-h-64 overflow-y-auto divide-y">
                    {detailLoading && (
                      <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                    )}
                    {!detailLoading && (detail.recipients ?? []).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{fmtPhone(r.phone)}</div>
                        </div>
                        <StatusBadge status={r.delivery_status} />
                      </div>
                    ))}
                    {!detailLoading && (detail.recipients?.length ?? 0) === 0 && (
                      <div className="p-4 text-center text-sm text-muted-foreground">—</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
