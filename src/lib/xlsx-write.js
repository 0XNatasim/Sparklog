// Minimal .xlsx writer (no dependency): a ZIP of XML files (stored, like zip-store.js). One sheet, a bold header row, text and
// number cells (a number stays a number in Excel), red bold cells, column widths, a frozen header and a filter on the header row.
import { buildZip } from "./zip-store";

// Control characters other than tab / line breaks are not allowed in XML 1.0.
const xmlSafe = (text) => [...String(text)].filter((ch) => { const code = ch.charCodeAt(0); return code >= 32 || code === 9 || code === 10 || code === 13; }).join("");
const escapeXml = (value) => xmlSafe(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function columnName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// Style numbers of the cellXfs below.
const STYLES = { header: 1, red: 2 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// rows: array of rows; the FIRST row is the header. A cell is a string, a number, null / "" (empty) or { v, style: "red" | "header" }.
// widths: character widths per column. Returns the file as a Uint8Array.
export function buildXlsx({ rows, widths = [], sheetName = "Feuil1" }) {
  const encoder = new TextEncoder();
  const cellXml = (cell, rowIndex, colIndex) => {
    const box = cell !== null && typeof cell === "object" ? cell : { v: cell };
    const value = box.v;
    const style = rowIndex === 0 ? STYLES.header : STYLES[box.style] || 0;
    if (value === null || value === undefined || value === "") return "";
    const ref = `${columnName(colIndex)}${rowIndex + 1}`;
    const s = style ? ` s="${style}"` : "";
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  };
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cellXml(cell, r, c)).join("")}</row>`).join("");
  const width = Math.max(...rows.map((row) => row.length), 1);
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${columnName(width - 1)}${Math.max(rows.length, 1)}"/></worksheet>`;
  const name = escapeXml(String(sheetName).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Feuil1");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES_XML],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
  return buildZip(files.map(([fileName, text]) => ({ name: fileName, data: encoder.encode(text) })));
}
