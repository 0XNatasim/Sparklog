// Month-end subcontractor inventory (migration 0142, V2.4.267). A manager schedules the day; the chosen employees give
// 5 to 10 screenshots of the Microsoft form they filled in; until then the database refuses to SUBMIT their work sheets
// dated on or after that day. Pictures: private « month-end-inventory » bucket, kept `retention_days` (60 by default).
import { compressImage } from "@/lib/ocr";
import { buildZip } from "@/lib/zip-store";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

export const MONTH_END_BUCKET = "month-end-inventory";
export const MONTH_END_MIN_FILES = 5;
export const MONTH_END_MAX_FILES = 10;
export const MONTH_END_DEFAULT_RETENTION_DAYS = 60;
export const MONTH_END_MIN_RETENTION_DAYS = 7;
export const MONTH_END_MAX_RETENTION_DAYS = 365;
// A form screenshot is tall (36 lines of text): kept larger than the other proofs so the numbers stay readable.
const PICTURE_EDGE = 2400;
const PICTURE_QUALITY = 0.8;

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

// The retention typed in the manager's field: a whole number of days in range, else null.
export function parseRetentionDays(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const days = Number(text);
  return days >= MONTH_END_MIN_RETENTION_DAYS && days <= MONTH_END_MAX_RETENTION_DAYS ? days : null;
}

// What the employee still has to do: the oldest open request (the database already filters the days that came), or null.
export async function fetchMyDueMonthEnd(client) {
  const { data, error } = await withTimeout(client.rpc("my_month_end_inventory_due"), 12000);
  if (error) throw error;
  const row = (data || [])[0];
  return row ? { requestId: row.request_id, dueDate: row.due_date, filesCount: Number(row.files_count) || 0 } : null;
}

// Pictures picked, added to those already sent: only images, at most MONTH_END_MAX_FILES in all; `skipped` counts the rest.
export function addPickedMonthEndFiles(current, picked, alreadySent = 0) {
  const kept = [...(current || [])];
  let skipped = 0;
  for (const file of picked || []) {
    const isImage = String(file?.type || "").toLowerCase().startsWith("image/") && !String(file.type).toLowerCase().includes("svg");
    if (!isImage || !(Number(file.size) > 0) || alreadySent + kept.length >= MONTH_END_MAX_FILES) { skipped += 1; continue; }
    kept.push(file);
  }
  return { files: kept, skipped };
}

// Sends one picture then records it; if the record fails the object just sent is removed, so nothing is left behind.
export async function uploadMonthEndFile(client, { userId, requestId }, file) {
  if (!isUuid(userId) || !isUuid(requestId)) throw new Error("month_end_inventory_bad_path");
  const blob = await compressImage(file, PICTURE_EDGE, PICTURE_QUALITY);
  if (!blob || !(blob.size > 0)) throw new Error("month_end_inventory_unreadable");
  const path = `${userId}/${requestId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await withTimeout(client.storage.from(MONTH_END_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }), 60000);
  if (uploadError) throw uploadError;
  const { data, error } = await withTimeout(client.rpc("add_month_end_inventory_file", { p_request_id: requestId, p_path: path, p_size: blob.size }), 12000)
    .catch((failure) => ({ data: null, error: failure }));
  if (error) {
    await client.storage.from(MONTH_END_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  return { id: data, path };
}

export async function submitMonthEnd(client, requestId) {
  const { error } = await withTimeout(client.rpc("submit_month_end_inventory", { p_request_id: requestId }), 12000);
  if (error) throw error;
}

// ── Manager side ─────────────────────────────────────────────────────────────────────────────────────────────────
// open (waiting), received (proof sent), waived (« Débloqué »). `late` = open and the day has passed; `due` = open today.
export function requestState(request, today) {
  if (request.submitted_at) return "received";
  if (request.waived_at) return "waived";
  if (request.due_date < today) return "late";
  if (request.due_date === today) return "due";
  return "scheduled";
}

// Rounds (newest first) with their people and files, names read from profiles. Throws on a read error.
export async function fetchMonthEndOverview(client) {
  const limit = QUERY_BUDGETS.monthEndInventory;
  const [rounds, requests, files, settings] = await Promise.all([
    withTimeout(client.from("month_end_inventory_rounds").select("id, due_date").order("due_date", { ascending: false }).limit(60), 12000),
    withTimeout(client.from("month_end_inventory_requests").select("id, round_id, user_id, submitted_at, waived_at, waive_reason").limit(limit), 12000),
    withTimeout(client.from("month_end_inventory_files").select("id, request_id, storage_path, uploaded_at, expires_at, purged_at").order("uploaded_at", { ascending: true }).limit(limit * 10), 12000),
    withTimeout(client.from("month_end_inventory_settings").select("retention_days").limit(1), 12000),
  ]);
  const failed = [rounds, requests, files, settings].find((result) => result.error);
  if (failed) throw failed.error;
  const userIds = [...new Set((requests.data || []).map((row) => row.user_id))];
  const names = new Map();
  for (let i = 0; i < userIds.length; i += QUERY_BUDGETS.inListChunk) {
    const { data, error } = await withTimeout(client.from("profiles").select("id, full_name").in("id", userIds.slice(i, i + QUERY_BUDGETS.inListChunk)), 12000);
    if (error) throw error;
    for (const person of data || []) names.set(person.id, (person.full_name || "").trim());
  }
  const filesByRequest = new Map();
  for (const file of files.data || []) {
    const list = filesByRequest.get(file.request_id) || [];
    list.push(file);
    filesByRequest.set(file.request_id, list);
  }
  const requestsByRound = new Map();
  for (const request of requests.data || []) {
    const list = requestsByRound.get(request.round_id) || [];
    list.push({ ...request, name: names.get(request.user_id) || "", files: filesByRequest.get(request.id) || [] });
    requestsByRound.set(request.round_id, list);
  }
  return {
    retentionDays: Number(settings.data?.[0]?.retention_days) || MONTH_END_DEFAULT_RETENTION_DAYS,
    rounds: (rounds.data || []).map((round) => ({
      ...round,
      requests: (requestsByRound.get(round.id) || []).sort((a, b) => a.name.localeCompare(b.name, "fr-CA")),
    })),
  };
}

// Employees a manager can pick: active accounts of the roles that run a warehouse. Throws on a read error.
export async function fetchPickableEmployees(client) {
  const { data, error } = await withTimeout(
    client.from("profiles").select("id, full_name, role, is_paused").in("role", ["employee", "foreman", "subcontractor_1"]).eq("is_paused", false)
      .order("full_name").limit(QUERY_BUDGETS.inventoryPeople),
    12000,
  );
  if (error) throw error;
  return (data || []).filter((person) => (person.full_name || "").trim());
}

export async function scheduleMonthEnd(client, dueDate, userIds) {
  const { error } = await withTimeout(client.rpc("schedule_month_end_inventory", { p_due_date: dueDate, p_user_ids: userIds }), 12000);
  if (error) throw error;
}

export async function removeMonthEndRequest(client, requestId) {
  const { error } = await withTimeout(client.rpc("remove_month_end_inventory_request", { p_request_id: requestId }), 12000);
  if (error) throw error;
}

export async function waiveMonthEndRequest(client, requestId, reason = "") {
  const { error } = await withTimeout(client.rpc("waive_month_end_inventory_request", { p_request_id: requestId, p_reason: reason || null }), 12000);
  if (error) throw error;
}

export async function setMonthEndRetention(client, days) {
  const { error } = await withTimeout(client.rpc("set_month_end_inventory_retention", { p_days: days }), 12000);
  if (error) throw error;
}

// Signed links (valid 1 h) for the pictures still kept: Map of path -> url.
export async function signedMonthEndUrls(client, paths) {
  const list = [...new Set((paths || []).filter(Boolean))];
  if (!list.length) return new Map();
  const { data, error } = await withTimeout(client.storage.from(MONTH_END_BUCKET).createSignedUrls(list, 3600), 12000);
  if (error) throw error;
  return new Map((data || []).filter((row) => row?.path && row.signedUrl).map((row) => [row.path, row.signedUrl]));
}

const cleanPart = (text, fallback) => (String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 _-]/g, " ")
  .replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback);

// File names of a ZIP: <date>/<person>_<n>.jpg, numbered per person. People with the same name are told apart by « (2) ».
export function monthEndZipNames(entries) {
  const used = new Map();
  return entries.map((entry) => {
    const base = `${cleanPart(entry.date, "date")}/${cleanPart(entry.person, "employe")}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return `${base}_${count}.jpg`;
  });
}

function saveZip(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Downloads every kept picture of the requests given (one round, or one person) into one ZIP. A picture that cannot be
// read is skipped and counted. `requests` = rows of the overview with their `files`, `dueDate` for the folder.
export async function downloadMonthEndZip(client, requests, dueDate, { filename = "inventaire-fin-de-mois.zip", onProgress } = {}) {
  const entries = [];
  for (const request of requests) {
    for (const file of request.files || []) {
      if (file.storage_path && !file.purged_at) entries.push({ path: file.storage_path, date: dueDate, person: request.name });
    }
  }
  const names = monthEndZipNames(entries);
  const zipFiles = [];
  let skipped = 0;
  for (let i = 0; i < entries.length; i += 1) {
    onProgress?.(i, entries.length);
    try {
      const { data, error } = await withTimeout(client.storage.from(MONTH_END_BUCKET).download(entries[i].path), 20000);
      if (error || !data) throw error || new Error("empty");
      zipFiles.push({ name: names[i], data: new Uint8Array(await data.arrayBuffer()) });
    } catch {
      skipped += 1;
    }
  }
  if (zipFiles.length) saveZip(buildZip(zipFiles), filename);
  return { saved: zipFiles.length, skipped };
}
