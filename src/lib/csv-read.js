// Minimal CSV reader (no dependency) for the Britton table saved as .csv. Handles quotes ("" inside a quoted field), line breaks inside
// quotes, a byte-order mark, and any of the usual separators (Excel in French writes « ; », in English « , », some tools a tab).

// Bytes → text: UTF-8 when valid, otherwise Windows-1252 (what Excel writes for a « CSV » without UTF-8), so accents survive.
export function decodeCsvBytes(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// text → grid (array of rows, each an array of strings). `delimiter` is one character.
export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") { if (source[i + 1] === "\n") i += 1; endRow(); }
    else field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

// The separators tried, in this order; the caller keeps the first one that makes the expected header appear.
export const CSV_DELIMITERS = [";", ",", "\t"];
