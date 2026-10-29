import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  MAX_PRESET_LABEL, PRESETS_EVENT, cleanPresetLabel, createPreset, deletePreset, fetchPresetRows, moveChanges, nextSortOrder, presetTaken, updatePreset,
} from "@/lib/preset-work-orders";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";

// Gestion › Configuration › OT prédéfinis (0124): the labels the time entry offers in its drop-down.
export default function PresetWorkOrdersManager() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState(null); // { id, label }
  const [confirm, confirmDialog] = useConfirmDialog();

  useEffect(() => {
    let cancelled = false;
    fetchPresetRows()
      .then((list) => { if (!cancelled) { setRows(list); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(friendlyErrorMessage(loadError, t, "presetOt.errors.load")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload, t]);

  async function run(action) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await action();
      setReload((n) => n + 1);
      window.dispatchEvent(new Event(PRESETS_EVENT));
      return true;
    } catch (actionError) {
      setError(/duplicate key|23505/i.test(String(actionError?.message || actionError?.code))
        ? t("presetOt.errors.taken")
        : friendlyErrorMessage(actionError, t, "presetOt.errors.save"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const labelError = (label, exceptId) => {
    if (!cleanPresetLabel(label)) return t("presetOt.errors.invalid", { max: MAX_PRESET_LABEL });
    if (presetTaken(rows, label, exceptId)) return t("presetOt.errors.taken");
    return "";
  };

  async function add(event) {
    event.preventDefault();
    const problem = labelError(newLabel, null);
    if (problem) { setError(problem); return; }
    if (await run(() => createPreset(newLabel, nextSortOrder(rows)))) setNewLabel("");
  }

  async function saveEdit() {
    const problem = labelError(editing.label, editing.id);
    if (problem) { setError(problem); return; }
    if (await run(() => updatePreset(editing.id, { label: editing.label }))) setEditing(null);
  }

  async function remove(row) {
    if (!(await confirm(t("presetOt.removeConfirm", { label: row.label })))) return;
    await run(() => deletePreset(row.id));
  }

  async function move(index, direction) {
    const changes = moveChanges(rows, index, direction);
    await run(async () => { for (const change of changes) await updatePreset(change.id, { sort_order: change.sort_order }); });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-lg font-bold">{t("presetOt.title")}</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("presetOt.help")}</p>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <form onSubmit={add} className="flex flex-wrap gap-2" noValidate>
          <Input aria-label={t("presetOt.newLabel")} placeholder={t("presetOt.newLabel")} value={newLabel} maxLength={MAX_PRESET_LABEL}
            onChange={(e) => setNewLabel(e.target.value)} disabled={busy} className="min-w-[14rem] flex-1" />
          <Button type="submit" disabled={busy}><Plus className="mr-1.5 h-4 w-4" />{t("presetOt.add")}</Button>
        </form>

        {loading && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}
        {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("presetOt.empty")}</p>}

        <ul className="space-y-1">
          {rows.map((row, index) => (
            <li key={row.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2", !row.active && "opacity-60")}>
              {editing?.id === row.id ? (
                <>
                  <Input aria-label={t("presetOt.rename")} value={editing.label} maxLength={MAX_PRESET_LABEL} autoFocus
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })} disabled={busy} className="min-w-[12rem] flex-1" />
                  <Button type="button" size="icon" variant="outline" aria-label={t("presetOt.save")} disabled={busy} onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={t("accidents.cancel")} disabled={busy} onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{row.label}{!row.active && <span className="ms-2 text-xs font-normal text-muted-foreground">{t("presetOt.hidden")}</span>}</span>
                  <Button type="button" size="icon" variant="ghost" aria-label={t("presetOt.up")} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={t("presetOt.down")} disabled={busy || index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={t("presetOt.rename")} disabled={busy} onClick={() => setEditing({ id: row.id, label: row.label })}><Pencil className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={row.active ? t("presetOt.hide") : t("presetOt.show")} disabled={busy} onClick={() => run(() => updatePreset(row.id, { active: !row.active }))}>
                    {row.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={t("presetOt.remove")} disabled={busy} onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
