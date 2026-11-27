// Pictures and screenshots on the notes (migration 0165): « Mes notes » and « Contremaître » can carry up to 10 each, kept in
// the private « note-files » bucket (folder = the sender's id) and listed in note_files. Who sees a picture follows the note it
// belongs to (row-level security). Every picture is re-encoded to JPEG first (EXIF / GPS removed). Keep the limits in step with 0165.
import dayjs from "dayjs";
import { addCalendarDays } from "@/lib/company-time";
import { ccqWeekNumber, weekStartSundayD } from "@/lib/ccq-week";
import { prepareEvidenceImage } from "@/lib/evidence-file";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { buildZip } from "@/lib/zip-store";
import { withTimeout } from "@/lib/utils";

export const NOTE_FILES_BUCKET = "note-files";
export const MAX_NOTE_FILES = 10;
// A picture as picked (a phone photo, a screenshot): it is shrunk before it is sent.
export const MAX_PICKED_BYTES = 30 * 1024 * 1024;
export const NOTE_FILE_ACCEPT = "image/*";
// The two parents of a picture: the column of note_files that holds the note's id.
export const NOTE_PARENTS = Object.freeze({ manager: "manager_note_id", foreman: "foreman_report_id" });
const FILE_COLUMNS = "id, manager_note_id, foreman_report_id, path, file_name, size_bytes, uploaded_at";

// Pictures only (SVG is refused: it can carry a script). `existing` = pictures already on the note. Refuses what is not a
// picture, empty, too large, or beyond MAX_NOTE_FILES in all; `skipped` counts them.
export function addPickedNoteImages(current, picked, existing = 0) {
  const kept = [...(current || [])];
  let skipped = 0;
  for (const file of picked || []) {
    const type = String(file?.type || "").toLowerCase();
    const isPicture = type.startsWith("image/") && !type.includes("svg") && !/\.svg$/i.test(String(file?.name || ""));
    if (!isPicture || !(Number(file.size) > 0) || Number(file.size) > MAX_PICKED_BYTES || existing + kept.length >= MAX_NOTE_FILES) { skipped += 1; continue; }
    kept.push(file);
  }
  return { files: kept, skipped };
}

export const noteFilePath = (userId, objectId) => `${userId}/${objectId}.jpg`;

// `parent` = { kind: "manager" | "foreman", id }. Pictures of these notes, grouped by note id (oldest first).
export async function fetchNoteFiles(client, kind, ids) {
  const column = NOTE_PARENTS[kind];
  const list = [...new Set((ids || []).filter(Boolean))];
  const byNote = new Map();
  if (!column || list.length === 0) return byNote;
  for (let i = 0; i < list.length; i += QUERY_BUDGETS.inListChunk) {
    const { data, error } = await withTimeout(
      client.from("note_files").select(FILE_COLUMNS).in(column, list.slice(i, i + QUERY_BUDGETS.inListChunk)).order("uploaded_at", { ascending: true }).limit(QUERY_BUDGETS.noteFiles),
      12000,
    );
    if (error) throw error;
    for (const row of data || []) {
      const key = row[column];
      if (!byNote.has(key)) byNote.set(key, []);
      byNote.get(key).push(row);
    }
  }
  return byNote;
}

// Sends one picture then records it; if the record fails the object just sent is removed, so nothing is left behind.
export async function uploadNoteFile(client, { kind, noteId, userId, file }) {
  const column = NOTE_PARENTS[kind];
  if (!column || !noteId || !userId) throw new Error("note_file_invalid");
  const image = await prepareEvidenceImage(file);
  const path = noteFilePath(userId, crypto.randomUUID());
  const { error: uploadError } = await withTimeout(client.storage.from(NOTE_FILES_BUCKET).upload(path, image, { contentType: "image/jpeg", upsert: false }), 60000);
  if (uploadError) throw uploadError;
  const fileName = `${String(file.name || "photo").replace(/\.[a-z0-9]{1,5}$/i, "").slice(0, 120) || "photo"}.jpg`;
  const { data, error } = await withTimeout(
    client.from("note_files").insert({ [column]: noteId, path, file_name: fileName, size_bytes: image.size }).select(FILE_COLUMNS).single(),
    12000,
  ).catch((failure) => ({ data: null, error: failure }));
  if (error) {
    await client.storage.from(NOTE_FILES_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  return data;
}

// Sends the pictures one after the other (a slow phone connection); returns { saved, failed } so the note itself is never lost
// because a picture failed.
export async function uploadNoteFiles(client, { kind, noteId, userId, files }) {
  let saved = 0;
  let failed = 0;
  for (const file of files || []) {
    try { await uploadNoteFile(client, { kind, noteId, userId, file }); saved += 1; } catch (error) { console.warn("[note-files] upload failed", error); failed += 1; }
  }
  return { saved, failed };
}

// The record first (what the screens show), then the object; a leftover object is only unreachable.
export async function removeNoteFile(client, file) {
  const { error } = await withTimeout(client.from("note_files").delete().eq("id", file.id), 12000);
  if (error) throw error;
  await client.storage.from(NOTE_FILES_BUCKET).remove([file.path]).catch(() => undefined);
}

// Before a note is deleted (its rows go with it, the objects would not): removes the objects of its pictures.
export async function removeNoteObjects(client, kind, noteId) {
  const files = (await fetchNoteFiles(client, kind, [noteId])).get(noteId) || [];
  if (files.length) await client.storage.from(NOTE_FILES_BUCKET).remove(files.map((file) => file.path)).catch(() => undefined);
}

// Signed links (valid 1 h): Map of path -> url.
export async function signedNoteFileUrls(client, paths) {
  const list = [...new Set(paths || [])];
  if (!list.length) return new Map();
  const { data, error } = await withTimeout(client.storage.from(NOTE_FILES_BUCKET).createSignedUrls(list, 3600), 12000);
  if (error) throw error;
  return new Map((data || []).filter((row) => row?.path && row.signedUrl).map((row) => [row.path, row.signedUrl]));
}

// ----- Download: one day or one week, as a ZIP -----

function cleanPart(text, fallback = "") {
  const cleaned = [...String(text ?? "")].map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? "-" : ch)).join("").replace(/\s+/g, " ").trim().slice(0, 60);
  return cleaned || fallback;
}

// `notes` = [{ id, date (YYYY-MM-DD), author, ot, text }]; `byNote` = Map note id → pictures. One flat, dated list of pictures.
export function listNotePictures(notes, byNote) {
  const files = [];
  for (const note of notes || []) {
    const pictures = byNote?.get(note.id) || [];
    pictures.forEach((picture, i) => files.push({ path: picture.path, date: note.date, author: note.author || "", ot: note.ot || "", noteId: note.id, index: i + 1, count: pictures.length }));
  }
  return files.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.author).localeCompare(String(b.author), "fr-CA") || a.noteId.localeCompare(b.noteId) || a.index - b.index);
}

// Weeks (Sunday → Saturday, like the payroll week) that hold at least one picture, newest first: { start, end, number }.
export function noteWeeks(files) {
  const starts = [...new Set((files || []).map((file) => weekStartSundayD(file.date).format("YYYY-MM-DD")))].sort().reverse();
  return starts.map((start) => {
    const end = addCalendarDays(start, 6);
    return { start, end, number: ccqWeekNumber(dayjs(end)) };
  });
}

// Days that hold at least one picture, newest first.
export const noteDays = (files) => [...new Set((files || []).map((file) => file.date))].sort().reverse();

// The pictures of one day (`from` = `to`) or one week.
export const selectNotePictures = (files, { from, to }) => (files || []).filter((file) => (!from || file.date >= from) && (!to || file.date <= to));

// Names inside the ZIP: « 2026-11-26_Karine_OT 270825_1.jpg » (date first so a folder sorts by day).
export function noteZipNames(files) {
  const used = new Map();
  return (files || []).map((file) => {
    const base = [cleanPart(file.date, "date"), cleanPart(file.author, "auteur"), file.ot ? `OT ${cleanPart(file.ot)}` : "", file.count > 1 ? String(file.index) : ""].filter(Boolean).join("_");
    const seen = used.get(base) || 0;
    used.set(base, seen + 1);
    return `${base}${seen ? ` (${seen + 1})` : ""}.jpg`;
  });
}

// A text file with the notes of the ZIP (date, author, work order, text, pictures), so the pictures keep their context.
export function noteSummaryText(notes, files, names) {
  const nameOf = new Map((files || []).map((file, i) => [`${file.noteId}|${file.index}`, names[i]]));
  const ids = new Set((files || []).map((file) => file.noteId));
  return (notes || []).filter((note) => ids.has(note.id)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.author).localeCompare(String(b.author), "fr-CA"))
    .map((note) => {
      const pictures = (files || []).filter((file) => file.noteId === note.id).map((file) => nameOf.get(`${file.noteId}|${file.index}`));
      return [`${note.date}${note.author ? ` — ${note.author}` : ""}${note.ot ? ` — OT ${note.ot}` : ""}`, String(note.text || "").trim(), ...pictures.map((name) => `  [${name}]`)].join("\n");
    }).join("\n\n");
}

// At most this many pictures per ZIP (a phone); press the button again for the rest.
export const MAX_NOTE_ZIP_FILES = 100;

export async function downloadNotePicturesZip(client, files, notes, { filename, summaryName = "notes.txt", onProgress, save }) {
  const batch = (files || []).slice(0, MAX_NOTE_ZIP_FILES);
  const names = noteZipNames(batch);
  const entries = [];
  const kept = [];
  let skipped = 0;
  for (let i = 0; i < batch.length; i += 1) {
    onProgress?.(i, batch.length);
    try {
      const { data, error } = await withTimeout(client.storage.from(NOTE_FILES_BUCKET).download(batch[i].path), 20000);
      if (error || !data) throw error || new Error("empty");
      entries.push({ name: names[i], data: new Uint8Array(await data.arrayBuffer()) });
      kept.push(i);
    } catch {
      skipped += 1;
    }
  }
  if (entries.length === 0) return { saved: 0, skipped, remaining: (files || []).length - batch.length };
  const keptFiles = kept.map((i) => batch[i]);
  const summary = noteSummaryText(notes, keptFiles, kept.map((i) => names[i]));
  if (summary) entries.push({ name: summaryName, data: new TextEncoder().encode(`\uFEFF${summary}\r\n`) });
  save(buildZip(entries), filename);
  return { saved: kept.length, skipped, remaining: (files || []).length - batch.length };
}
