// « Télécharger les justificatifs » (migration 0126): the overtime screenshots and the parking receipt
// pictures still kept in the app, put in one ZIP. Downloading removes nothing; evidence_downloads remembers
// what was already taken (every manager, every device), so a second download only brings what is new.
import dayjs from "dayjs";
import { addCalendarDays } from "@/lib/company-time";
import { ccqWeekNumber, weekStartSundayD } from "@/lib/ccq-week";
import { buildZip } from "@/lib/zip-store";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

export const OVERTIME_BUCKET = "overtime-evidence";
export const PARKING_BUCKET = "parking-receipts";
// One ZIP stays small enough for a phone; the button is pressed again for the rest.
export const MAX_FILES_PER_ZIP = 100;

// Weeks (Sunday → Saturday, like the payroll week) that hold at least one kept picture, newest first.
// Each: { start, end, number } — `number` is the CCQ week number (end-of-week Saturday).
export function evidenceWeeks(files) {
  const starts = [...new Set(files.map((file) => weekStartSundayD(file.date).format("YYYY-MM-DD")))].sort().reverse();
  return starts.map((start) => {
    const end = addCalendarDays(start, 6);
    return { start, end, number: ccqWeekNumber(dayjs(end)) };
  });
}

export const fileKey = (file) => `${file.bucket}/${file.path}`;

function cleanPart(text, fallback = "") {
  const cleaned = [...String(text ?? "")].map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? "-" : ch)).join("").replace(/\s+/g, " ").trim().slice(0, 60);
  return cleaned || fallback;
}

// Every kept picture as one flat list. `names`: Map userId → full name.
export function listEvidenceFiles({ overtime = [], parking = [], names = new Map() }) {
  const files = [];
  for (const row of overtime) {
    if (!row.storage_path) continue;
    files.push({ bucket: OVERTIME_BUCKET, path: row.storage_path, kind: "overtime", date: row.job_date, userId: row.user_id, ot: row.jobs?.ot || "", index: 1, count: 1 });
  }
  for (const row of parking) {
    const paths = [row.storage_path, ...(Array.isArray(row.extra_storage_paths) ? row.extra_storage_paths : [])].filter(Boolean);
    paths.forEach((path, i) => files.push({ bucket: PARKING_BUCKET, path, kind: "parking", date: row.job_date, userId: row.user_id, ot: row.jobs?.ot || "", index: i + 1, count: paths.length }));
  }
  return files
    .map((file) => ({ ...file, employee: names.get(file.userId) || "" }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.employee).localeCompare(String(b.employee), "fr-CA") || a.kind.localeCompare(b.kind) || a.index - b.index);
}

// Filters of the dialog. `done`: Set of fileKey() already downloaded.
export function selectEvidence(files, { done = new Set(), includeDone = false, from = "", to = "", kinds = ["overtime", "parking"] } = {}) {
  const inScope = files.filter((file) => kinds.includes(file.kind) && (!from || file.date >= from) && (!to || file.date <= to));
  const fresh = inScope.filter((file) => !done.has(fileKey(file)));
  return { inScope, fresh, alreadyDone: inScope.length - fresh.length, chosen: includeDone ? inScope : fresh };
}

// Names inside the ZIP: date first so the folder sorts by day. `labels`: { overtime, parking } words.
export function zipEntryNames(files, labels = { overtime: "temps-supp", parking: "stationnement" }) {
  const used = new Map();
  return files.map((file) => {
    const suffix = file.kind === "parking" && file.count > 1 ? `${labels.parking}-${file.index}` : labels[file.kind];
    const base = [cleanPart(file.date, "date"), cleanPart(file.employee, "employe"), file.ot ? `OT ${cleanPart(file.ot)}` : "", suffix].filter(Boolean).join("_");
    const seen = used.get(base) || 0;
    used.set(base, seen + 1);
    return `${base}${seen ? ` (${seen + 1})` : ""}.jpg`;
  });
}

export async function loadEvidenceCatalog(client) {
  const limit = QUERY_BUDGETS.evidenceDownload;
  const nowIso = new Date().toISOString();
  const [overtime, parking, marks] = await Promise.all([
    client.from("overtime_evidence").select("storage_path, job_date, user_id, jobs(ot)").gt("expires_at", nowIso).order("job_date", { ascending: false }).limit(limit),
    client.from("parking_receipts").select("storage_path, extra_storage_paths, job_date, user_id, jobs(ot)").not("storage_path", "is", null).order("job_date", { ascending: false }).limit(limit),
    client.from("evidence_downloads").select("bucket, storage_path").limit(limit * 4),
  ]);
  const failed = [overtime, parking, marks].find((result) => result.error);
  if (failed) throw failed.error;
  const userIds = [...new Set([...(overtime.data || []), ...(parking.data || [])].map((row) => row.user_id))];
  const names = new Map();
  for (let i = 0; i < userIds.length; i += QUERY_BUDGETS.inListChunk) {
    const { data, error } = await client.from("profiles").select("id, full_name").in("id", userIds.slice(i, i + QUERY_BUDGETS.inListChunk));
    if (error) throw error;
    for (const person of data || []) names.set(person.id, (person.full_name || "").trim());
  }
  return {
    files: listEvidenceFiles({ overtime: overtime.data || [], parking: parking.data || [], names }),
    done: new Set((marks.data || []).map((row) => `${row.bucket}/${row.storage_path}`)),
  };
}

function saveBlob(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Downloads `files` (at most MAX_FILES_PER_ZIP), saves the ZIP, then marks as downloaded the pictures that are in
// it. A picture that cannot be read is skipped and NOT marked, so the next download brings it again.
export async function downloadEvidenceZip(client, files, { labels, onProgress, filename } = {}) {
  const batch = files.slice(0, MAX_FILES_PER_ZIP);
  const names = zipEntryNames(batch, labels);
  const entries = [];
  const saved = [];
  let skipped = 0;
  for (let i = 0; i < batch.length; i += 1) {
    onProgress?.(i, batch.length);
    try {
      const { data, error } = await withTimeout(client.storage.from(batch[i].bucket).download(batch[i].path), 20000);
      if (error || !data) throw error || new Error("empty");
      entries.push({ name: names[i], data: new Uint8Array(await data.arrayBuffer()) });
      saved.push(batch[i]);
    } catch {
      skipped += 1;
    }
  }
  if (entries.length === 0) return { saved: 0, skipped, remaining: files.length - batch.length };
  saveBlob(buildZip(entries), filename || "justificatifs.zip");
  const { error: markError } = await client.from("evidence_downloads")
    .upsert(saved.map((file) => ({ bucket: file.bucket, storage_path: file.path })), { onConflict: "bucket,storage_path", ignoreDuplicates: true });
  return { saved: entries.length, skipped, remaining: files.length - batch.length, markError: markError?.message || "" };
}
