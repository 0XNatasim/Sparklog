import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseInventoryText } from "../../supabase/functions/process_inventory_screenshot/parse.ts";
import { sumCrewDefective, sumCrewInventory, sumRegionInventory, inventoryRegionChoices, compareInventory, effectiveOcrStatus, markInventoryAbsences, mergeInventoryItems, summarizeInventoryDay } from "./inventory-items";
import { inventoryCaptured, inventoryStepComplete } from "./inventory-screenshots";

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
    expect(first.items[2]).toEqual({ code: "EQ000026", name: "Contrôleur chauffe-eau Hilo", quantity: 19, section: "inventory" });
    expect(first.total).toBe(17);
    expect(first.unparsed).toBe(0);

    const second = parseInventoryText(SHOT_2);
    expect(second.items).toHaveLength(7);
    expect(second.items[4]).toEqual({ code: "EQ000047", name: "Sinope - 4000W", quantity: 10, section: "inventory" });
  });

  it("keeps digits in a name apart from the quantity and repairs OCR letter/digit mix-ups", () => {
    const third = parseInventoryText(SHOT_3);
    expect(third.items.map((item) => item.code)).toContain("EQ000048");
    expect(third.items.find((item) => item.code === "EQ000040").name).toBe("Thermostat intelligent Hilo 3");
    expect(third.items.find((item) => item.code === "EQ000016").quantity).toBe(84);
  });

  it("counts rows without a quantity as unparsed and ignores text with no code", () => {
    expect(parseInventoryText("EQ000001 Calypso").unparsed).toBe(1);
    expect(parseInventoryText("nothing here")).toEqual({ items: [], total: null, defectiveTotal: null, defectiveHeader: false, unparsed: 0 });
  });

  it("rebuilds the full 17-item list from the three overlapping screenshots", () => {
    const rows = [SHOT_1, SHOT_2, SHOT_3].flatMap((text, index) =>
      parseInventoryText(text).items.map((item) => ({ ...item, slot: index + 1 })));
    expect(mergeInventoryItems(rows)).toHaveLength(17);
  });
});

// End of the list and the « Produits défectueux » section, as on an English-language phone
// ("1 - 15 of 17"): the same codes appear in both lists with other quantities.
const SHOT_DEFECTIVE = `E- EQ000050 ··· Sonde - Calypso 0,00
E- EQ000031 ··· Sonde pour CEE 8,00
ABC 1 - 15 of 17
Produits défectueux
E- EQ000040 ··· Thermostat intelligent Hilo 3600… 1,00
E- EQ000016 ··· Thermostat intelligent Hilo 4000… 2,00
ABC 1 - 2 of 2`;

describe("parseInventoryText — « Produits défectueux »", () => {
  it("keeps the rows under the title apart, with their own pager", () => {
    const parsed = parseInventoryText(SHOT_DEFECTIVE);
    expect(parsed.total).toBe(17);
    expect(parsed.defectiveTotal).toBe(2);
    expect(parsed.defectiveHeader).toBe(true);
    expect(parsed.unparsed).toBe(0);
    expect(parsed.items.filter((item) => item.section === "inventory").map((item) => [item.code, item.quantity]))
      .toEqual([["EQ000050", 0], ["EQ000031", 8]]);
    expect(parsed.items.filter((item) => item.section === "defective").map((item) => [item.code, item.quantity]))
      .toEqual([["EQ000040", 1], ["EQ000016", 2]]);
  });

  it("reads the title without its accent, and a list with no title has no defective rows", () => {
    expect(parseInventoryText("Produits defectueux\nEQ000040 Hilo 1,00").items[0].section).toBe("defective");
    expect(parseInventoryText(SHOT_3).items.every((item) => item.section === "inventory")).toBe(true);
    expect(parseInventoryText(SHOT_3).defectiveTotal).toBeNull();
  });

  it("never lets a defective quantity replace the list's quantity of the same code", () => {
    const rows = [SHOT_3, SHOT_DEFECTIVE].flatMap((text, index) =>
      parseInventoryText(text).items.map((item) => ({ ...item, slot: index === 0 ? 1 : 4 })));
    const day = summarizeInventoryDay([{ slot: 1, ocr_status: "processed", list_total: 17 }, { slot: 4, ocr_status: "processed", defective_total: 2 }], rows);
    expect(day.items.find((item) => item.code === "EQ000016").quantity).toBe(84);
    expect(day.defective).toMatchObject({ state: "ok", count: 2, expected: 2, picture: true });
    expect(day.defective.items.find((item) => item.code === "EQ000016").quantity).toBe(2);
  });
});

describe("summarizeInventoryDay", () => {
  const shot = (slot, extra = {}) => ({ slot, ocr_status: "processed", list_total: 17, ...extra });
  const rows = (count) => Array.from({ length: count }, (_, i) => ({ code: `EQ${String(i).padStart(6, "0")}`, name: `Item ${i}`, quantity: 1, slot: 1 }));

  it("flags a missing, unreadable, unverified and complete day", () => {
    expect(summarizeInventoryDay([], []).state).toBe("missing");
    expect(summarizeInventoryDay([shot(1), shot(2)], rows(14))).toMatchObject({ state: "review", count: 14, expected: 17 });
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3, { ocr_status: "pending" })], rows(17)).state).toBe("reading");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3, { ocr_status: "failed" })], []).state).toBe("photos");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3)], rows(15)).state).toBe("review");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3)], rows(17))).toMatchObject({ state: "ok", count: 17, expected: 17 });
  });

  it("calls a list complete when it matches the app's total, even if a screenshot had an unreadable fragment", () => {
    expect(summarizeInventoryDay([shot(1), shot(2, { ocr_status: "needs_review" }), shot(3, { ocr_status: "needs_review" })], rows(17)).state).toBe("ok");
  });

  it("judges the list by its line count, not by the number of screenshots", () => {
    expect(summarizeInventoryDay([shot(1), shot(2)], rows(17))).toMatchObject({ state: "ok", captures: 2 });
    expect(summarizeInventoryDay([shot(1)], rows(17))).toMatchObject({ state: "ok", captures: 1 });
  });

  it("never calls a list complete when it does not match the app's total", () => {
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3, { ocr_status: "needs_review" })], rows(16)).state).toBe("review");
    expect(summarizeInventoryDay([shot(1), shot(2), shot(3)], rows(18)).state).toBe("review");
    expect(summarizeInventoryDay([shot(1, { list_total: null }), shot(2, { list_total: null }), shot(3, { list_total: null })], rows(17)).state).toBe("review");
  });
});

describe("defective products of the day", () => {
  const shot = (slot, extra = {}) => ({ slot, ocr_status: "processed", list_total: 17, ...extra });
  const row = (code, section, slot = 1) => ({ code, name: code, quantity: 1, slot, section });

  it("leaves the list state to slots 1-3 and reads slot 4 apart", () => {
    const day = summarizeInventoryDay([shot(1), shot(4, { ocr_status: "pending", list_total: null })], [row("EQ000001", "inventory")]);
    expect(day.captures).toBe(1);
    expect(day.state).not.toBe("reading");
    expect(day.defective.state).toBe("reading");
    expect(summarizeInventoryDay([shot(4, { list_total: null })], []).state).toBe("missing");
  });

  it("says none, unreadable or unverified", () => {
    expect(summarizeInventoryDay([shot(1)], [row("EQ000001", "inventory")]).defective).toMatchObject({ state: "none", count: 0 });
    expect(summarizeInventoryDay([shot(1), shot(4, { ocr_status: "needs_review" })], []).defective.state).toBe("photos");
    expect(summarizeInventoryDay([shot(1)], [row("EQ000002", "defective")]).defective).toMatchObject({ state: "review", count: 1, picture: false });
  });

  it("treats older rows without a section as the equipment list", () => {
    expect(summarizeInventoryDay([shot(1)], [{ code: "EQ000001", name: "A", quantity: 1, slot: 1 }]).count).toBe(1);
  });

  it("only counts the list screenshots toward submission, and asks the question", () => {
    expect(inventoryCaptured([{ slot: 4 }])).toBe(false);
    expect(inventoryCaptured([{ slot: 2 }])).toBe(true);
    expect(inventoryStepComplete([{ slot: 1 }], null)).toBe(false);
    expect(inventoryStepComplete([{ slot: 1 }], "no")).toBe(true);
    expect(inventoryStepComplete([{ slot: 1 }], "yes")).toBe(false);
    expect(inventoryStepComplete([{ slot: 1 }, { slot: 4 }], "yes")).toBe(true);
    expect(inventoryStepComplete([{ slot: 4 }], "yes")).toBe(false);
  });

  it("sums the crew's defective products, without flagging employees who have none", () => {
    const entry = (name, state, items) => ({ name, defective: { state, items } });
    const { rows, counted, unverified } = sumCrewDefective([
      entry("A", "ok", [{ code: "EQ000016", name: "Hilo", quantity: 2 }]),
      entry("B", "none", []),
      entry("C", "review", [{ code: "EQ000016", name: "Hilo", quantity: 1 }]),
    ]);
    expect(rows).toEqual([{ code: "EQ000016", name: "Hilo", total: 3, holders: 2 }]);
    expect(counted).toBe(2);
    expect(unverified).toEqual(["C"]);
  });
});

describe("sumCrewInventory", () => {
  const item = (code, quantity, name = `Item ${code}`) => ({ code, name, quantity });
  const ok = (name, items) => ({ name, state: "ok", items });

  it("sums each equipment code over all employees and counts who holds it", () => {
    const { rows, counted, unverified } = sumCrewInventory([
      ok("A", [item("EQ000001", 5), item("EQ000002", 0)]),
      ok("B", [item("EQ000001", 12.5), item("EQ000003", 2)]),
    ]);
    expect(counted).toBe(2);
    expect(unverified).toEqual([]);
    expect(rows.find((row) => row.code === "EQ000001")).toMatchObject({ total: 17.5, holders: 2 });
    expect(rows.find((row) => row.code === "EQ000002")).toMatchObject({ total: 0, holders: 0 });
  });

  it("flags employees whose list is not verified, so totals are not read as complete", () => {
    const { counted, unverified } = sumCrewInventory([
      ok("A", [item("EQ000001", 1)]),
      { name: "B", state: "review", items: [item("EQ000001", 2)] },
      { name: "C", state: "missing", items: [] },
    ]);
    expect(counted).toBe(2);
    expect(unverified).toEqual(["B", "C"]);
  });
});

describe("sumRegionInventory", () => {
  const item = (code, quantity) => ({ code, name: `Item ${code}`, quantity });
  const entry = (name, region, items) => ({ name, state: "ok", person: { work_region: region }, items });

  it("sums only the employees of the selected region", () => {
    const entries = [
      entry("A", "06", [item("EQ000001", 4), item("EQ000002", 1)]),
      entry("B", "06", [item("EQ000001", 3)]),
      entry("C", "13", [item("EQ000001", 10)]),
      entry("D", "", [item("EQ000009", 2)]),
    ];
    const montreal = sumRegionInventory(entries, "06");
    expect(montreal.counted).toBe(2);
    expect(montreal.rows.find((row) => row.code === "EQ000001")).toMatchObject({ total: 7, holders: 2 });
    expect(montreal.rows.find((row) => row.code === "EQ000002")).toMatchObject({ total: 1, holders: 1 });
    expect(sumRegionInventory(entries, "13").rows[0]).toMatchObject({ code: "EQ000001", total: 10 });
    expect(sumRegionInventory(entries, "").rows[0]).toMatchObject({ code: "EQ000009", total: 2 });
    expect(inventoryRegionChoices(entries, [{ code: "06", name: "Montréal" }, { code: "13", name: "Laval" }])).toEqual([
      { code: "06", name: "Montréal" },
      { code: "13", name: "Laval" },
      { code: "", name: "" },
    ]);
  });
});

describe("compareInventory", () => {
  const item = (code, quantity, name = `Item ${code}`) => ({ code, name, quantity });
  const today = [item("EQ000001", 5), item("EQ000002", 10), item("EQ000004", 0)];
  const before = [item("EQ000001", 17), item("EQ000002", 10), item("EQ000003", 3)];

  it("shows today minus the previous day, signed", () => {
    const rows = compareInventory(today, before, { todayComplete: true, previousComplete: true });
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));
    expect(byCode.EQ000001).toMatchObject({ today: 5, previous: 17, diff: -12 });
    expect(byCode.EQ000002.diff).toBe(0);
  });

  it("counts a missing code as 0 only when that day's list is verified complete", () => {
    const complete = Object.fromEntries(compareInventory(today, before, { todayComplete: true, previousComplete: true }).map((row) => [row.code, row]));
    expect(complete.EQ000003).toMatchObject({ today: 0, previous: 3, diff: -3 });
    expect(complete.EQ000004).toMatchObject({ today: 0, previous: 0, diff: 0 });
    const unverified = Object.fromEntries(compareInventory(today, before).map((row) => [row.code, row]));
    expect(unverified.EQ000003).toMatchObject({ today: null, previous: 3, diff: null });
    expect(unverified.EQ000004.diff).toBeNull();
  });

  it("rounds decimal differences", () => {
    const [row] = compareInventory([item("EQ000001", 0.3)], [item("EQ000001", 0.1)], { todayComplete: true, previousComplete: true });
    expect(row.diff).toBe(0.2);
  });
});

describe("effectiveOcrStatus", () => {
  const sent = "2026-10-07T17:48:00.000Z";
  const at = (minutes) => Date.parse(sent) + minutes * 60000;
  it("keeps a recent pending reading as pending and gives up on a stale one", () => {
    expect(effectiveOcrStatus({ ocr_status: "pending", created_at: sent }, at(1))).toBe("pending");
    expect(effectiveOcrStatus({ ocr_status: "pending", created_at: sent }, at(10))).toBe("failed");
  });
  it("restarts the clock when a manager asks for a new reading, and leaves final statuses alone", () => {
    expect(effectiveOcrStatus({ ocr_status: "pending", created_at: sent }, at(11), at(10))).toBe("pending");
    expect(effectiveOcrStatus({ ocr_status: "processed", created_at: sent }, at(99))).toBe("processed");
  });
});

describe("InventoryScreenshotsPanel", () => {
  const panel = read("../components/InventoryScreenshotsPanel.jsx");
  it("never reloads on every render: the translate function stays out of dependency lists", () => {
    // useT() returns a new function each render; depending on it re-ran the load, closed the
    // open card and cleared the photos continuously.
    expect(panel).not.toMatch(/\[[^\]]*\bt\b[^\]]*\]\s*\)/);
    expect(panel).toContain("tRef.current");
  });
});

describe("0097 migration (defective products)", () => {
  const sql = read("../../supabase/migrations/20261016170000_0097_inventory_defective_products.sql");
  it("adds slot 4 and the section, unique per section, and keeps the gate on slots 1-3", () => {
    expect(sql).toContain("check (slot between 1 and 4)");
    expect(sql).toContain("check (section in ('inventory', 'defective'))");
    expect(sql).toContain("unique (user_id, job_date, slot, section, code)");
    expect(sql).toContain("s.job_date = new.job_date and s.slot between 1 and 3");
    expect(sql).toContain("revoke all on function public.validate_job_submission_contract() from public, anon, authenticated;");
  });
  it("is matched by the reading function: slot 4 keeps only rows under the title", () => {
    const fn = read("../../supabase/functions/process_inventory_screenshot/index.ts");
    expect(fn).toContain("const DEFECTIVE_SLOT = 4;");
    expect(fn).toContain('item.section === "defective"');
    expect(fn).toContain("section: item.section");
    expect(read("../../supabase/functions/delete_inventory_screenshots/index.ts")).toContain("slot > 4");
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
  it("lets only a manager delete screenshots, files first, with an audit entry", () => {
    const fn = read("../../supabase/functions/delete_inventory_screenshots/index.ts");
    expect(fn).toContain('role !== "manager"');
    expect(fn.indexOf("storage.from(\"inventory-screenshots\").remove")).toBeLessThan(fn.indexOf('from("inventory_screenshots").delete()'));
    expect(fn).toContain('action: "inventory_deleted"');
  });
  it("only lets a manager read another employee's screenshots", () => {
    const fn = read("../../supabase/functions/process_inventory_screenshot/index.ts");
    expect(fn).toContain('role !== "manager"');
    expect(fn).not.toContain("ocr_text");
  });
});

describe("negative quantities read from the capture (Field Service « -1,00 »)", () => {
  it("reads the minus as part of the quantity, never in the name", () => {
    const stacked = parseInventoryText(`E-\nEQ000008 ...\nGradateur mural intelligent Jasco…\n-1,00\nE-\nEQ000025 ...\nInterrupteur auxiliaire (3 voies et …\n1,00\n`);
    expect(stacked.items.map((item) => [item.code, item.name, item.quantity])).toEqual([
      ["EQ000008", "Gradateur mural intelligent Jasco", -1],
      ["EQ000025", "Interrupteur auxiliaire (3 voies et", 1],
    ]);
    const inline = parseInventoryText("E- EQ000008 ··· Gradateur mural intelligent Jasc… - 2,00\nE- EQ000049 ··· Calypso V1 −3,00");
    expect(inline.items.map((item) => item.quantity)).toEqual([-2, -3]);
    expect(inline.items[0].name).toBe("Gradateur mural intelligent Jasc");
  });

  it("keeps a dash inside a name (« Sinope - 3000W ») and positive quantities as they were", () => {
    const parsed = parseInventoryText(SHOT_2);
    expect(parsed.items.find((item) => item.code === "EQ000046")).toEqual({ code: "EQ000046", name: "Sinope - 3000W", quantity: 0, section: "inventory" });
    expect(parsed.items.find((item) => item.code === "EQ000047").quantity).toBe(10);
    expect(parsed.items.every((item) => item.quantity >= 0)).toBe(true);
  });
});

describe("markInventoryAbsences (Inventaire : employés en congé grisés)", () => {
  const date = "2026-10-27"; // a Tuesday
  const entry = (id, state) => ({ person: { id }, name: id, state });
  const entries = [entry("a", "missing"), entry("b", "missing"), entry("c", "ok"), entry("d", "missing"), entry("e", "missing")];
  const timeOff = [
    { user_id: "a", category: "vacances", kind: "range", start_date: "2026-10-26", end_date: "2026-10-30" },
    { user_id: "c", category: "maladie", kind: "range", start_date: "2026-10-27", end_date: "2026-10-27" },
    { user_id: "d", category: "conge", kind: "range", start_date: "2026-10-27", end_date: "2026-10-27", start_time: "13:00" },
    { user_id: "e", category: "temps_partiel", kind: "recurring_weekly", start_date: "2026-01-01", end_date: null, weekdays: [2], exception_dates: [] },
    { user_id: "b", category: "absence", kind: "range", start_date: "2026-10-20", end_date: "2026-10-24" },
  ];

  it("greys out who is away all day without a list, at the end, and keeps the others", () => {
    const result = markInventoryAbsences(entries, timeOff, date);
    expect(result.map((r) => r.person.id)).toEqual(["b", "c", "d", "a", "e"]);
    expect(result.find((r) => r.person.id === "a").off.category).toBe("vacances");
    expect(result.find((r) => r.person.id === "e").off.category).toBe("temps_partiel"); // recurring weekday
    expect(result.find((r) => r.person.id === "b").off).toBeNull(); // leave ended before
    expect(result.find((r) => r.person.id === "c").off).toBeNull(); // sent a list anyway
    expect(result.find((r) => r.person.id === "d").off).toBeNull(); // part of the day only
  });

  it("changes nothing without time off", () => {
    expect(markInventoryAbsences(entries, [], date).map((r) => r.off)).toEqual([null, null, null, null, null]);
  });
});
