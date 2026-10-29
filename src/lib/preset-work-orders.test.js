import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import {
  DEFAULT_PRESET_LABELS, cleanPresetLabel, matchPreset, moveChanges, nextSortOrder, presetTaken,
} from "./preset-work-orders";

describe("cleanPresetLabel", () => {
  it("tidies the spaces and writes it in capitals, like the OT typed by hand", () => {
    expect(cleanPresetLabel("  formation   Hq ")).toBe("FORMATION HQ");
    expect(cleanPresetLabel("pause sécurité")).toBe("PAUSE SÉCURITÉ");
  });

  it("refuses a label the table would refuse: too short, too long, or a real OT number", () => {
    expect(cleanPresetLabel("a")).toBeNull();
    expect(cleanPresetLabel("")).toBeNull();
    expect(cleanPresetLabel("x".repeat(61))).toBeNull();
    expect(cleanPresetLabel("190403")).toBeNull(); // 4 digits or more: the reuse check would flag it
    expect(cleanPresetLabel("123")).toBe("123");
  });
});

describe("matchPreset", () => {
  it("finds the label an OT text stands for, ignoring case and spaces", () => {
    expect(matchPreset("ok karine", DEFAULT_PRESET_LABELS)).toBe("OK KARINE");
    expect(matchPreset("  Pause  sécurité ", DEFAULT_PRESET_LABELS)).toBe("PAUSE SÉCURITÉ");
    expect(matchPreset("190403", DEFAULT_PRESET_LABELS)).toBeNull();
    expect(matchPreset("", DEFAULT_PRESET_LABELS)).toBeNull();
  });
});

describe("presetTaken", () => {
  const rows = [{ id: "a", label: "OK KARINE" }, { id: "b", label: "FORMATION HQ" }];
  it("sees a name already used, but not the row itself", () => {
    expect(presetTaken(rows, "ok  karine")).toBe(true);
    expect(presetTaken(rows, "OK KARINE", "a")).toBe(false);
    expect(presetTaken(rows, "NOUVEAU")).toBe(false);
  });
});

describe("order", () => {
  const rows = [{ id: "a", sort_order: 10 }, { id: "b", sort_order: 20 }, { id: "c", sort_order: 20 }];
  it("moves a row and renumbers by tens, writing only the rows that change", () => {
    expect(moveChanges(rows, 1, -1)).toEqual([{ id: "b", sort_order: 10 }, { id: "a", sort_order: 20 }, { id: "c", sort_order: 30 }]);
    expect(moveChanges(rows, 0, -1)).toEqual([]);
    expect(moveChanges(rows, 2, 1)).toEqual([]);
  });
  it("puts a new label after the last", () => {
    expect(nextSortOrder(rows)).toBe(30);
    expect(nextSortOrder([])).toBe(10);
  });
});

describe("migration 0124", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261030120000_0124_preset_work_orders.sql", import.meta.url), "utf8");
  it("lets everybody signed in read the list but only managers change it", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for select to authenticated using (true)");
    expect(sql.match(/public\.get_my_role\(\) = 'manager'/g).length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("grant select on public.preset_work_orders to authenticated");
  });
  it("refuses a label that looks like a real OT number, and seeds the five of the owner", () => {
    expect(sql).toContain("!~ '^[0-9]{4,}$'");
    for (const label of DEFAULT_PRESET_LABELS) expect(sql).toContain(`'${label}'`);
  });
});
