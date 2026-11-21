// Britton overtime table (migration 0156): Britton sends a table of the overtime it approved (end time, electrician, company, OT,
// minutes of execution = at the client, return minutes, date, note, total). A manager imports the .xlsx in À traiter › OCR and
// each line is shown beside the Sparklog sheet of the same OT and day. Read only: nothing here changes a job or a pay.
import { PROOF_CLIENT_TOLERANCE_MIN, PROOF_RETURN_TOLERANCE_MIN } from "./overtime-proof-check";
import { fetchAllRows } from "./fetch-all";
import { CSV_DELIMITERS, decodeCsvBytes, parseCsv } from "./csv-read";
import { fileBytes, readXlsxSheets } from "./xlsx-read";
import { withTimeout } from "./utils";

export const BRITTON_IMPORT_CHUNK = 500; // the database takes at most 1000 lines per call

// « Vanessa Mcgraw-robichaud » / « vanessa  mcgraw robichaud » → "vanessa mcgraw robichaud" (same key on both sides).
export const nameKey = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

// Header text without accents / case / curly quotes, to find the columns whatever the exact wording is.
const header = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();

const COLUMN_TESTS = {
  endedAt: (h) => h.startsWith("heure de fin"),
  // Two layouts: the current one (« Nom », « Compagnie », « OT », « Temps d'exécution », « Temps de retour », « Durée ») and the
  // older one of 16-18 Nov. (« Prénom Nom », « Entreprise », « Numéro du OT-XXXXXX », « client », « Auto », « heure total en TS »).
  name: (h) => h.startsWith("nom") || h === "prenom nom",
  company: (h) => h.startsWith("compagnie") || h.startsWith("entreprise"),
  ot: (h) => h === "ot" || h === "# ot" || h === "no ot" || h === "numero ot" || h.startsWith("numero du ot"),
  client: (h) => /^temps d'?\s?exe/.test(h) || h === "client",
  returned: (h) => /^temps de(?!x)\b/.test(h) || h === "auto",
  // The « Date » / « Date installation » column is NOT read: it is the date the form was submitted, not the work day (owner,
  // 2026-11-21). The day of a line is the date of its « Heure de fin ».
  note: (h) => h.startsWith("note"),
  total: (h) => h.startsWith("duree") || h.startsWith("heure total"),
};
const REQUIRED = ["name", "ot", "client", "returned", "endedAt"];

// Finds the header row (within the first 30 rows): { row, columns: { name: 1, ot: 3, … } } or null.
// When no row has every required column, `missingColumns` says which ones the closest row lacks.
function scanHeader(grid) {
  let best = { missing: REQUIRED };
  for (let r = 0; r < Math.min(grid.length, 30); r += 1) {
    const columns = {};
    (grid[r] || []).forEach((cell, index) => {
      const text = header(cell);
      if (!text) return;
      for (const [field, test] of Object.entries(COLUMN_TESTS)) if (columns[field] === undefined && test(text)) { columns[field] = index; break; }
    });
    const missing = REQUIRED.filter((field) => columns[field] === undefined);
    if (missing.length === 0) return { row: r, columns, missing };
    if (missing.length < best.missing.length) best = { missing };
  }
  return { row: null, columns: null, missing: best.missing };
}

export function findHeader(grid) {
  const { row, columns } = scanHeader(grid);
  return row === null ? null : { row, columns };
}

// Required columns the closest row of the grid lacks (names of COLUMN_TESTS: name, ot, client, returned, date).
export const missingColumns = (grid) => scanHeader(grid || []).missing;

const pad = (value) => String(value).padStart(2, "0");
const validDay = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// A date cell: "2026-11-19", "2026-11-19 14:17" (what the reader gives for a date cell) or the American text of the sample
// ("11/19/2026", "11/19/26 14:17": month first). Returns { day: "YYYY-MM-DD", time: "HH:MM" | null } or null.
export function parseBrittonDate(value) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  let parts = null;
  if (match) parts = { y: +match[1], m: +match[2], d: +match[3], hh: match[4], mm: match[5] };
  else if ((match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2}))?/))) {
    parts = { y: match[3].length === 2 ? 2000 + +match[3] : +match[3], m: +match[1], d: +match[2], hh: match[4], mm: match[5] };
  }
  if (!parts) return null;
  const day = validDay(parts.y, parts.m, parts.d);
  if (!day) return null;
  const time = parts.hh !== undefined && +parts.hh < 24 && +parts.mm < 60 ? `${pad(parts.hh)}:${parts.mm}` : null;
  return { day, time };
}

// « OT-234262 » / 234262 → "234262" (3 to 8 digits, like the proofs); anything else → null.
export function brittonOt(value) {
  const match = String(value ?? "").trim().match(/^(?:OT[\s\-–—_:]*)?(\d{3,8})$/i);
  return match ? match[1] : null;
}

function minutesCell(value) {
  if (value === null || value === undefined || value === "") return 0; // an empty cell = 0 minutes
  const number = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  return Number.isFinite(number) && number >= 0 && number <= 9999 ? Math.round(number) : null;
}

// grid (array of rows) → { rows, skipped: [{ line, reason }] } with rows ready for import_britton_overtime. A line without OT and
// without name is an empty / total line and is ignored; any other line that cannot be read is listed in `skipped` (never guessed).
// The line's day is the date of its « Heure de fin » (the « Date » column is the submission date and is ignored).
// The same (day, OT, name) twice in the file keeps the last one.
export function parseBrittonGrid(grid) {
  const found = findHeader(grid || []);
  if (!found) return { rows: [], skipped: [], headerFound: false, missing: missingColumns(grid) };
  const { row: headerRow, columns } = found;
  const byKey = new Map();
  const skipped = [];
  for (let r = headerRow + 1; r < grid.length; r += 1) {
    const cells = grid[r] || [];
    const at = (field) => (columns[field] === undefined ? undefined : cells[columns[field]]);
    const rawOt = String(at("ot") ?? "").trim();
    const name = String(at("name") ?? "").trim();
    if (!rawOt && !name) continue;
    const line = r + 1;
    const ot = brittonOt(rawOt);
    const ended = parseBrittonDate(at("endedAt"));
    const client = minutesCell(at("client"));
    const returned = minutesCell(at("returned"));
    if (!ot) { skipped.push({ line, reason: "ot" }); continue; }
    if (!name || !nameKey(name)) { skipped.push({ line, reason: "name" }); continue; }
    if (!ended) { skipped.push({ line, reason: "date" }); continue; } // no readable « Heure de fin »
    if (client === null || returned === null) { skipped.push({ line, reason: "minutes" }); continue; }
    const rawTotal = at("total");
    const hasTotal = rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== "";
    const total = hasTotal ? minutesCell(rawTotal) : null;
    const note = String(at("note") ?? "").trim();
    const company = String(at("company") ?? "").trim();
    const row = {
      job_date: ended.day, ot, employee_name: name.slice(0, 120), name_key: nameKey(name), company: company ? company.slice(0, 120) : null,
      ended_at: ended?.time ? `${ended.day} ${ended.time}` : null, client_minutes: client, return_minutes: returned,
      total_minutes: total === null ? client + returned : total, note: note ? note.slice(0, 500) : null,
    };
    byKey.set(`${row.job_date}|${row.ot}|${row.name_key}`, row);
  }
  return { rows: [...byKey.values()], skipped, headerFound: true };
}

// The file as Britton sent it: an .xlsx (a ZIP, starts with "PK") or a .csv (any other text), told apart by the first bytes, not by the
// name. → parseBrittonGrid of the first sheet / separator that has the Britton header. The old .xls (binary) is refused: xlsx_unsupported.
export async function readBrittonFile(file) {
  const bytes = await fileBytes(file);
  let closest = { rows: [], skipped: [], headerFound: false, missing: REQUIRED };
  const consider = (parsed) => {
    if (parsed.headerFound) return parsed;
    if (parsed.missing.length < closest.missing.length) closest = parsed;
    return null;
  };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    for (const grid of await readXlsxSheets(bytes)) {
      const found = consider(parseBrittonGrid(grid));
      if (found) return found;
    }
    return closest;
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw new Error("xlsx_unsupported");
  const text = decodeCsvBytes(bytes);
  for (const delimiter of CSV_DELIMITERS) {
    const found = consider(parseBrittonGrid(parseCsv(text, delimiter)));
    if (found) return found;
  }
  return closest;
}

// Sends the lines by chunks of 500. Returns { inserted, updated }. Throws when the database refuses (nothing after that chunk is sent).
export async function importBrittonRows(client, rows) {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BRITTON_IMPORT_CHUNK) {
    const { data, error } = await withTimeout(client.rpc("import_britton_overtime", { p_rows: rows.slice(i, i + BRITTON_IMPORT_CHUNK) }), 30000);
    if (error) throw error;
    inserted += Number(data?.inserted) || 0;
    updated += Number(data?.updated) || 0;
  }
  return { inserted, updated };
}

const BRITTON_COLUMNS = "id, job_date, ot, employee_name, name_key, client_minutes, return_minutes, total_minutes, note, ended_at, imported_at";

const addDays = (isoDay, count) => {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
// Whole days from `from` to `to` (YYYY-MM-DD both).
export const dayDiff = (from, to) => Math.round((Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`)) / 86400000);
// A Britton line ends the day of the work or up to two days after (a form filled the next morning or after the week-end).
export const BRITTON_WINDOW_DAYS = 2;
export const shiftDay = addDays;

// The imported lines whose day is `fromDay` or later (all pages). The day of a line is the date of its end time (older imports took
// the « Date » column, which is the submission date: their stored end time is used instead); the same Britton line imported twice
// (same OT, name and end time) keeps the most recent import. A table that does not exist yet (migration 0156 not applied) = no lines.
export async function fetchBrittonRows(client, fromDay) {
  const { data, error } = await fetchAllRows(() => client.from("britton_overtime").select(BRITTON_COLUMNS).gte("job_date", addDays(fromDay, -3)).order("id"));
  if (error) {
    if (/britton_overtime|does not exist|schema cache|42P01|PGRST205/i.test(`${error.message || ""} ${error.code || ""}`)) return [];
    throw error;
  }
  const latest = new Map();
  for (const row of data || []) {
    const ended = String(row.ended_at || "").replace(" ", "T");
    const line = { ...row, job_date: ended ? ended.slice(0, 10) : String(row.job_date).slice(0, 10) };
    const key = ended ? `${line.ot}|${line.name_key}|${ended.slice(0, 16)}` : `id:${line.id}`;
    const kept = latest.get(key);
    if (!kept || String(line.imported_at || "") > String(kept.imported_at || "")) latest.set(key, line);
  }
  return [...latest.values()].filter((line) => line.job_date >= fromDay);
}

// Puts each Britton line beside the Sparklog proof rows (buildOcrRows) of the same OT whose work day is the line's day or up to
// two days before it. When several lines qualify, the one with the same name wins, then the closest day. `britton` of a row = the
// line or null; `brittonWrong` = fields (client / return) that differ from what the Sparklog timesheet says, with the same
// tolerances as the proofs. `unmatched` = Britton lines no Sparklog proof row answers to.
export function attachBritton(rows, brittonRows) {
  const byOt = new Map();
  for (const line of brittonRows || []) {
    if (!byOt.has(line.ot)) byOt.set(line.ot, []);
    byOt.get(line.ot).push(line);
  }
  const used = new Set();
  const out = (rows || []).map((row) => {
    const ot = brittonOt(row.jobOt) || brittonOt(row.found?.ot);
    const candidates = (ot ? byOt.get(ot) || [] : []).map((line) => ({ line, lag: dayDiff(row.jobDate, line.job_date) })).filter(({ lag }) => lag >= 0 && lag <= BRITTON_WINDOW_DAYS);
    const named = candidates.filter(({ line }) => line.name_key === nameKey(row.name));
    const pool = named.length ? named : candidates.length === 1 ? candidates : [];
    const line = pool.sort((a, b) => a.lag - b.lag)[0]?.line || null;
    if (!line) return { ...row, britton: null, brittonWrong: new Set() };
    used.add(line.id);
    const wrong = new Set();
    if (row.expected) {
      if (Math.abs(line.client_minutes - row.expected.clientMinutes) > PROOF_CLIENT_TOLERANCE_MIN) wrong.add("client");
      if (Math.abs(line.return_minutes - row.expected.returnMinutes) > PROOF_RETURN_TOLERANCE_MIN) wrong.add("return");
    }
    return { ...row, britton: line, brittonWrong: wrong };
  });
  const unmatched = (brittonRows || []).filter((line) => !used.has(line.id)).sort((a, b) => String(b.job_date).localeCompare(String(a.job_date)) || a.employee_name.localeCompare(b.employee_name));
  return { rows: out, unmatched };
}
