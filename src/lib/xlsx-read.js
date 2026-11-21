// Minimal .xlsx reader (no dependency): an .xlsx file is a ZIP of XML files. Reads the FIRST sheet and returns a grid of cells
// (array of rows, each an array): text stays text, numbers become numbers, and a cell whose format is a date / time becomes the
// text "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" (built from the serial number without any time zone, so a date never moves by a day).
// ZIP entries may be stored (method 0) or deflated (method 8: the browser's DecompressionStream).

const decoder = new TextDecoder("utf-8");

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("xlsx_unsupported");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Central directory of the ZIP: Map of entry name -> { method, size, compressedSize, offset }.
function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("xlsx_invalid");
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error("xlsx_invalid");
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const size = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const offset = view.getUint32(pos + 42, true);
    entries.set(decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength)), { method, size, compressedSize, offset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function entryText(bytes, entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return decoder.decode(raw);
  if (entry.method === 8) return decoder.decode(await inflateRaw(raw));
  throw new Error("xlsx_unsupported");
}

const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");
const children = (node, name) => [...node.getElementsByTagName(name)];

function sharedStrings(xml) {
  if (!xml) return [];
  return children(parseXml(xml), "si").map((si) => children(si, "t").map((t) => t.textContent).join(""));
}

// Built-in number formats that are dates / times, and custom formats that contain a date or time letter outside quotes / brackets.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormatCode = (code) => /[dmyhs]/i.test(String(code || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));

// Style index (the `s` of a cell) -> true when that style shows a date / time.
function dateStyles(xml) {
  const dates = new Set();
  if (!xml) return dates;
  const doc = parseXml(xml);
  const custom = new Map(children(doc, "numFmt").map((node) => [Number(node.getAttribute("numFmtId")), node.getAttribute("formatCode")]));
  const cellXfs = doc.getElementsByTagName("cellXfs")[0];
  if (!cellXfs) return dates;
  [...cellXfs.children].forEach((xf, index) => {
    const id = Number(xf.getAttribute("numFmtId"));
    if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id)))) dates.add(index);
  });
  return dates;
}

const pad = (value) => String(value).padStart(2, "0");

// Excel serial (days since 1899-12-30, the 1900 leap-year bug already absorbed) -> "YYYY-MM-DD" or "YYYY-MM-DD HH:MM".
export function serialToText(serial) {
  const whole = Math.floor(serial);
  const date = new Date(Date.UTC(1899, 11, 30 + whole));
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const minutes = Math.round((serial - whole) * 1440);
  if (!minutes) return day;
  return `${day} ${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

const columnIndex = (ref) => {
  let n = 0;
  for (const ch of String(ref).replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

function sheetGrid(xml, strings, dates) {
  const grid = [];
  for (const rowNode of children(parseXml(xml), "row")) {
    const row = [];
    for (const cell of children(rowNode, "c")) {
      const index = columnIndex(cell.getAttribute("r"));
      if (index < 0) continue;
      const type = cell.getAttribute("t");
      const valueNode = cell.getElementsByTagName("v")[0];
      const raw = valueNode ? valueNode.textContent : "";
      let value = null;
      if (type === "inlineStr") value = children(cell, "t").map((t) => t.textContent).join("");
      else if (type === "s") value = strings[Number(raw)] ?? "";
      else if (type === "str" || type === "e") value = raw;
      else if (type === "b") value = raw === "1";
      else if (raw !== "" && Number.isFinite(Number(raw))) value = dates.has(Number(cell.getAttribute("s"))) ? serialToText(Number(raw)) : Number(raw);
      row[index] = value;
    }
    grid[Number(rowNode.getAttribute("r")) - 1 || grid.length] = row;
  }
  return Array.from(grid, (row) => row || []);
}

// `file`: a File / Blob (or bytes). Returns the grids of every sheet, in file order (sheet1, sheet2…). Throws xlsx_invalid / xlsx_unsupported.
export async function readXlsxSheets(file) {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const entries = zipEntries(bytes);
  const names = [...entries.keys()].filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!names.length) throw new Error("xlsx_invalid");
  const [strings, styles] = await Promise.all([entryText(bytes, entries, "xl/sharedStrings.xml"), entryText(bytes, entries, "xl/styles.xml")]);
  const shared = sharedStrings(strings);
  const dates = dateStyles(styles);
  const grids = [];
  for (const name of names) grids.push(sheetGrid(await entryText(bytes, entries, name), shared, dates));
  return grids;
}
