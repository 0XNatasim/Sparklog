// Turns the OCR text of one Field Service inventory screenshot into rows.
// Each row of the app shows: an "E-" avatar, the equipment code (EQ000049), its name and a
// quantity written with two decimals (0,00). The last line shows "1 - 17 de 17", the size of
// the whole list, which lets the caller tell a complete reading from a partial one.

export type InventoryItem = { code: string; name: string; quantity: number };
export type ParsedInventory = { items: InventoryItem[]; total: number | null; unparsed: number };

const CODE = /EQ([0-9OoIl]{6})/g;
const FOOTER = /\bABC\b|\d+\s*[-–]\s*\d+\s+de\s+\d+/i;
const TOTAL = /\d+\s*[-–]\s*\d+\s+de\s+(\d+)/i;

// OCR often confuses digits with letters inside the numeric part of the code.
function normalizeCode(digits: string): string {
  return `EQ${digits.replace(/[Oo]/g, "0").replace(/[Il]/g, "1")}`;
}

export function parseInventoryText(raw: string): ParsedInventory {
  const text = String(raw || "").replace(/\r/g, "\n");
  const totalMatch = text.match(TOTAL);
  const total = totalMatch ? Number(totalMatch[1]) : null;

  const matches = [...text.matchAll(CODE)];
  const items: InventoryItem[] = [];
  let unparsed = 0;

  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index! : text.length;
    let segment = text.slice(match.index! + match[0].length, end);
    const footer = segment.search(FOOTER);
    if (footer >= 0) segment = segment.slice(0, footer);
    // Row menu "…" / "···" and table separators are not part of the name.
    segment = segment.replace(/[·•…⋯]+|\.{2,}|[|\t]/g, " ").replace(/\s+/g, " ").trim();

    // The quantity is the last number written with decimals; anything after it is the next
    // row's avatar ("E-") and is dropped.
    const quantities = [...segment.matchAll(/(\d{1,6}[.,]\d{2})(?!\d)/g)];
    const last = quantities[quantities.length - 1];
    if (!last) {
      unparsed += 1;
      return;
    }
    const quantity = Number(last[1].replace(",", "."));
    const name = segment
      .slice(0, last.index)
      .replace(/^(?:E\s*-\s*)+/, "")
      .trim();
    items.push({ code: normalizeCode(match[1]), name: name || normalizeCode(match[1]), quantity });
  });

  return { items, total, unparsed };
}
