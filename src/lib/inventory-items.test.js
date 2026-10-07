import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseInventoryText } from "../../supabase/functions/process_inventory_screenshot/parse.ts";
import { mergeInventoryItems, summarizeInventoryDay } from "./inventory-items";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

// Text as the three real screenshots read: avatar, code, name, quantity, row menu.
const SHOT_1 = `E-
EQ000049 ...
Calypso V1
0,00
E-
EQ000052 ...
Calypso V2
0,00
E-
EQ000026 ...
Contrôleur chauffe-eau Hilo
19,00
E-
EQ000043 ...
Ensemble chauffe-eau
0,00
E-
EQ000008 ...
Gradateur mural intelligent J…
1,00
E-
EQ000025 ...
Interrupteur auxiliaire (3 voie…
1,00
E-
EQ000014 ...
Interrupteur mural intelligent…
1,00
ABC 1 - 17 de 17`;

const SHOT_2 = `E- EQ000041 ··· Module d'expansion pour pla… 1,00
E- EQ000017 ··· Passerelle Hilo 20,00
E- EQ000015 ··· Prise murale intelligente Jasc… 0,00
E- EQ000046 ··· Sinope - 3000W 0,00
E- EQ000047 ··· Sinope - 4000W 10,00
E- EQ000048 ··· Sinopé Light (3 fils) 12,00
E- EQ000050 ··· Sonde - Calypso 0,00
ABC 1 - 17 de 17`;

const SHOT_3 = `EQ000046 ... Sinope - 3000W 0,00
EQ000047 ... Sinope - 4000W 10,00
EQ0O0048 ... Sinopé Light (3 fils) 12,00
EQ000050 ... Sonde - Calypso 0,00
EQ000031 ... Sonde pour CEE 15,00
EQ000040 ... Thermostat intelligent Hilo 3… 17,00
EQ000016 ... Thermostat intelligent Hilo 4… 84,00
1 - 17 de 17`;

describe("parseInventoryText", () => {
  it("reads one row per equipment code with its quantity, in either OCR layout", () => {
    const first = parseInventoryText(SHOT_1);
    expect(first.items).toHaveLength(7);
    expect(first.items[2]).toEqual({ code: "EQ000026", name: "Contrôleur chauffe-eau Hilo", quantity: 19 });
    expect(first.total).toBe(17);
    expect(first.unparsed).toBe(0);

    const second = parseInventoryText(SHOT_2);
    expect(second.items).toHaveLength(7);
    expect(second.items[4]).toEqual({ code: "EQ000047", name: "Sinope - 4000W", quantity: 10 });
  });

  it("keeps digits in a name apart from the quantity and repairs OCR letter/digit mix-ups", () => {
    const third = parseInventoryText(SHOT_3);
    expect(third.items.map((item) => item.code)).toContain("EQ000048");
    expect(third.items.find((item) => item.code === "EQ000040").name).toBe("Thermostat intelligent Hilo 3");
    expect(third.items.find((item) => item.code === "EQ000016").quantity).toBe(84);
  });

  it("counts rows without a quantity as unparsed and ignores text with no code", () => {
    expect(parseInventoryText("EQ000001 Calypso").unparsed).toBe(1);
    expect(parseInventoryText("nothing here")).toEqual({ items: [], total: null, unparsed: 0 });
  });

  it("rebuilds the full 17-item list from the three overlapping screenshots", () => {
    const rows = [SHOT_1, SHOT_2, SHOT_3].flatMap((text, index) =>
      parseInventoryText(text).items.map((item) => ({ ...item, slot: index + 1 })));
    expect(mergeInventoryItems(rows)).toHaveLength(17);
  });
});

describe("summarizeInventoryDay", () => {
  const shot = (slot, extra = {}) => ({ slot, ocr_status: "processed", list_total: 17, ...extra });
  const rows = (count) => Array.from({ length: count }, (_, i) => ({ code: `EQ${String(i).padStart(6, "0")}`, name: `Item ${i}`, quantity: 1, slot: 1 }));

  it("flags a missing, partial, unreadable, unverified and complete day", () => {
    expect(summarizeInventoryDay([], []).state).toBe("missing");
    expect(summarizeInventoryDay([shot(1), shot(2)], rows(14)).state).toBe("partial");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3, { ocr_status: "pending" })], rows(17)).state).toBe("reading");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3, { ocr_status: "failed" })], []).state).toBe("photos");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3)], rows(15)).state).toBe("review");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3)], rows(17))).toMatchObject({ state: "ok", count: 17, expected: 17 });
  });

  it("never calls a list verified when a screenshot needed review", () => {
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3, { ocr_status: "needs_review" })], rows(17)).state).toBe("review");
  });
});

describe("0073 migration and deployment", () => {
  const sql = read("../../supabase/migrations/20261008120000_0073_inventory_items_ocr.sql");
  it("stores only parsed rows, readable by the owner and managers, written by the service role", () => {
    expect(sql).toContain("unique (user_id, job_date, slot, code)");
    expect(sql).not.toMatch(/ocr_text/);
    expect(sql).toContain("for select to authenticated");
    expect(sql).not.toMatch(/for (insert|update|delete)/);
  });
  it("is expired by the cleanup worker", () => {
    expect(read("../../supabase/functions/cleanup_overtime_evidence/index.ts")).toContain('from("inventory_items")');
  });
  it("only lets a manager read another employee's screenshots", () => {
    const fn = read("../../supabase/functions/process_inventory_screenshot/index.ts");
    expect(fn).toContain('role !== "manager"');
    expect(fn).not.toContain("ocr_text");
  });
});
