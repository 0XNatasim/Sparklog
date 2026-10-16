// Turns the OCR text of one Field Service inventory screenshot into rows.
// Each row of the app shows: an "E-" avatar, the equipment code (EQ000049), its name and a
// quantity written with two decimals (0,00). Under each list a pager shows "1 - 17 de 17" (or
// "1 - 15 of 17" when the phone is in English), the size of the whole list, which lets the caller
// tell a complete reading from a partial one.
// Below the equipment list, Field Service shows a second list titled « Produits défectueux »
// (defective products). Rows under that title are returned with section "defective" and never
// counted in the equipment list (V2.4.146); everything above it is section "inventory".

export type InventorySection = "inventory" | "defective";
export type InventoryItem = { code: string; name: string; quantity: number; section: InventorySection };
export type ParsedInventory = {
  items: InventoryItem[];
  // Size of the equipment list and of the defective list, from their pagers ("N de N" / "N of N").
  total: number | null;
  defectiveTotal: number | null;
  // True when the « Produits défectueux » title was read.
  defectiveHeader: boolean;
  unparsed: number;
};

const CODE = /EQ([0-9OoIl]{6})/g;
const PAGER = /\d+\s*[-–]\s*\d+\s+(?:de|of)\s+(\d+)/gi;
const FOOTER = /\bABC\b|\d+\s*[-–]\s*\d+\s+(?:de|of)\s+\d+/i;
// « Produits défectueux » (OCR may drop or garble the accent), or the English label.
const DEFECTIVE_HEADER = /produits?\s+d\S{0,2}fectu|defective\s+products?/i;

// OCR often confuses digits with letters inside the numeric part of the code.
function normalizeCode(digits: string): string {
  return `EQ${digits.replace(/[Oo]/g, "0").replace(/[Il]/g, "1")}`;
}

export function parseInventoryText(raw: string): ParsedInventory {
  const text = String(raw || "").replace(/\r/g, "\n");
  const headerMatch = DEFECTIVE_HEADER.exec(text);
  const headerAt = headerMatch ? headerMatch.index : -1;
  const sectionAt = (index: number): InventorySection => (headerAt >= 0 && index > headerAt ? "defective" : "inventory");

  // Each list has its own pager: the first one above the title is the equipment list's, the first
  // one under it the defective list's.
  let total: number | null = null;
  let defectiveTotal: number | null = null;
  for (const pager of text.matchAll(PAGER)) {
    const value = Number(pager[1]);
    if (sectionAt(pager.index!) === "inventory") total ??= value;
    else defectiveTotal ??= value;
  }

  const matches = [...text.matchAll(CODE)];
  const items: InventoryItem[] = [];
  let unparsed = 0;

  matches.forEach((match, index) => {
    const start = match.index! + match[0].length;
    let end = index + 1 < matches.length ? matches[index + 1].index! : text.length;
    // The last equipment row stops at the « Produits défectueux » title.
    if (headerAt >= start && headerAt < end) end = headerAt;
    let segment = text.slice(start, end);
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
    const code = normalizeCode(match[1]);
    items.push({ code, name: name || code, quantity, section: sectionAt(match.index!) });
  });

  return { items, total, defectiveTotal, defectiveHeader: headerAt >= 0, unparsed };
}
