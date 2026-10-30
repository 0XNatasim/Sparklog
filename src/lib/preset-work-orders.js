import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";

// Pre-made work orders (0124): entries that come back every day and are not Field Service jobs. The chosen label is
// written to jobs.ot as plain text, like a typed OT. The same list is the fallback when it cannot be read (offline,
// before the migration): the time entry must never lose its drop-down.
export const DEFAULT_PRESET_LABELS = Object.freeze([
  "PAUSE SÉCURITÉ", "FORMATION HILO EMBAUCHE", "FORMATION BRITTON", "FORMATION HQ", "OK KARINE",
]);
export const MAX_PRESET_LABEL = 60;
const CACHE_KEY = "sparklog.presetWorkOrders";
export const PRESETS_EVENT = "sparklog:preset-work-orders";

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("fr-CA");

// The label as stored: spaces tidied, upper case like the OT typed by hand. Null when the table would refuse it
// (2 to 60 characters, and not a real OT number of 4 digits or more, which the reuse check would flag).
export function cleanPresetLabel(value) {
  const label = normalize(value);
  if (label.length < 2 || label.length > MAX_PRESET_LABEL || /^[0-9]{4,}$/.test(label)) return null;
  return label;
}

export function presetTaken(presets, label, exceptId = null) {
  const key = normalize(label);
  return (presets || []).some((preset) => preset.id !== exceptId && normalize(preset.label) === key);
}

// The preset an OT text stands for (case, accents' case and spaces ignored), or null.
export function matchPreset(ot, labels) {
  const key = normalize(ot);
  return key ? (labels || []).find((label) => normalize(label) === key) || null : null;
}

function readCache() {
  try {
    const list = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    return Array.isArray(list) && list.every((label) => typeof label === "string") ? list : null;
  } catch {
    return null;
  }
}

function writeCache(labels) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(labels)); } catch { /* storage unavailable */ }
}

// Active labels in order. Throws on a read error (the manager screen says so).
export async function fetchPresetLabels() {
  const { data, error } = await withTimeout(
    supabase.from("preset_work_orders").select("label").eq("active", true).order("sort_order").order("label").limit(100),
    8000,
  );
  if (error) throw error;
  return (data || []).map((row) => row.label);
}

// All rows, hidden ones included, for the manager screen.
export async function fetchPresetRows() {
  const { data, error } = await withTimeout(
    supabase.from("preset_work_orders").select("id, label, sort_order, active").order("sort_order").order("label").limit(100),
    12000,
  );
  if (error) throw error;
  return data || [];
}

export async function createPreset(label, sortOrder) {
  const clean = cleanPresetLabel(label);
  if (!clean) throw new Error("preset_label_invalid");
  const { error } = await withTimeout(supabase.from("preset_work_orders").insert({ label: clean, sort_order: sortOrder }), 12000);
  if (error) throw error;
}

export async function updatePreset(id, fields) {
  const patch = {};
  if ("label" in fields) {
    const clean = cleanPresetLabel(fields.label);
    if (!clean) throw new Error("preset_label_invalid");
    patch.label = clean;
  }
  if ("active" in fields) patch.active = Boolean(fields.active);
  if ("sort_order" in fields) patch.sort_order = fields.sort_order;
  const { error } = await withTimeout(supabase.from("preset_work_orders").update(patch).eq("id", id), 12000);
  if (error) throw error;
}

export async function deletePreset(id) {
  const { error } = await withTimeout(supabase.from("preset_work_orders").delete().eq("id", id), 12000);
  if (error) throw error;
}

// The drop-down of the time entry: the saved copy first (instant, works offline), then the database. An unreadable
// list keeps what is shown. Refreshed after a change on the manager screen.
export function usePresetWorkOrders() {
  const [labels, setLabels] = useState(() => readCache() || [...DEFAULT_PRESET_LABELS]);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchPresetLabels().then((list) => {
      if (cancelled) return;
      // An emptied list is a real choice (every label hidden): the drop-down then shows nothing.
      writeCache(list);
      setLabels(list);
    }, () => undefined);
    load();
    window.addEventListener(PRESETS_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(PRESETS_EVENT, load); };
  }, []);
  return labels;
}

// Moves the row at `index` up (-1) or down (+1) and renumbers the list by tens: the rows whose sort_order changes,
// as [{ id, sort_order }]. Nothing at the ends of the list.
export function moveChanges(rows, index, direction) {
  const target = index + direction;
  if (!rows?.[index] || !rows[target]) return [];
  const order = [...rows];
  [order[index], order[target]] = [order[target], order[index]];
  return order.map((row, position) => ({ id: row.id, sort_order: (position + 1) * 10, was: row.sort_order }))
    .filter((row) => row.sort_order !== row.was)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

// The sort_order of a new label: after the last one.
export const nextSortOrder = (rows) => Math.min(10000, Math.max(0, ...(rows || []).map((row) => Number(row.sort_order) || 0)) + 10);
