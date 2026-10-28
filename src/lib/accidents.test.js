import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import {
  accidentPayload, accidentToForm, accidentsCsv, emptyAccident, filterAccidents, openAccidentCount, validateAccident,
} from "./accidents";

const valid = { ...emptyAccident("2026-10-28"), person_name: "Jean Test", description: "Chute d'une échelle" };
const rows = [
  { id: "1", occurred_on: "2026-10-27", person_name: "Éloïse", kind: "injury", location: "Entrepôt Laval", description: "Coupure", status: "open", cnesst_claim: "C-1", lost_days: 2 },
  { id: "2", occurred_on: "2026-10-01", person_name: "Marc", kind: "near_miss", location: "Chantier", description: "Câble au sol", status: "closed", cnesst_claim: null, lost_days: null },
];

describe("validateAccident", () => {
  it("accepts a complete file and a lost-days count of 0", () => {
    expect(validateAccident(valid)).toEqual([]);
    expect(validateAccident({ ...valid, lost_days: "0" })).toEqual([]);
  });

  it("requires a date, a person and a description of at least 3 characters", () => {
    expect(validateAccident({ ...valid, occurred_on: "" })).toContain("occurred_on");
    expect(validateAccident({ ...valid, person_name: "  " })).toContain("person_name");
    expect(validateAccident({ ...valid, description: "ab" })).toContain("description");
  });

  it("rejects negative, fractional and absurd lost days, and unknown choices", () => {
    for (const lost_days of ["-1", "1.5", "1001", "abc"]) expect(validateAccident({ ...valid, lost_days }), lost_days).toContain("lost_days");
    expect(validateAccident({ ...valid, kind: "other" })).toContain("kind");
    expect(validateAccident({ ...valid, severity: "meh" })).toContain("severity");
  });
});

describe("accidentPayload", () => {
  it("trims, turns empty optional fields into null and never sends server-owned fields", () => {
    const payload = accidentPayload({ ...valid, person_name: " Jean Test ", location: "  ", lost_days: "3", occurred_time: "", status: "closed", created_by: "x", closed_at: "x" });
    expect(payload).toMatchObject({ person_name: "Jean Test", location: null, lost_days: 3, occurred_time: null, status: "closed", employee_id: null });
    expect(payload).not.toHaveProperty("created_by");
    expect(payload).not.toHaveProperty("closed_at");
  });

  it("keeps lost days of 0 as 0, not null", () => {
    expect(accidentPayload({ ...valid, lost_days: "0" }).lost_days).toBe(0);
  });

  it("round-trips an existing row through the form", () => {
    const form = accidentToForm({ ...rows[0], occurred_time: "14:30:00", employee_id: null });
    expect(form).toMatchObject({ occurred_time: "14:30", lost_days: 2, employee_id: "", witnesses: "" });
  });
});

describe("filterAccidents", () => {
  it("filters by status, kind and accent-free search", () => {
    expect(filterAccidents(rows, { status: "open" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAccidents(rows, { kind: "near_miss" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAccidents(rows, { search: "eloise" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAccidents(rows, { search: "c-1" }).map((r) => r.id)).toEqual(["1"]);
    expect(openAccidentCount(rows)).toBe(1);
  });
});

describe("accidentsCsv", () => {
  const labels = {
    columns: Object.fromEntries(["date", "time", "person", "kind", "severity", "location", "description", "witnesses", "treatment", "lostDays", "claim", "actions", "status"].map((k) => [k, k])),
    kind: { injury: "Blessure" }, severity: {}, status: { open: "Ouvert" },
  };
  it("quotes cells and defuses spreadsheet formulas", () => {
    const csv = accidentsCsv([{ ...rows[0], description: "=HYPERLINK(\"x\");a", severity: "medical" }], labels);
    const [header, line] = csv.split("\r\n");
    expect(header.split(";")).toHaveLength(13);
    expect(line).toContain("\"'=HYPERLINK(\"\"x\"\");a\"");
    expect(line).toContain("Blessure");
  });
});

describe("migration 0120", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261028120000_0120_accident_register.sql", import.meta.url), "utf8");
  it("is manager-only, with no delete path and an audit trail", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("public.get_my_role() = 'manager'");
    expect(sql).toContain("grant select, insert, update on public.accident_log to authenticated");
    expect(sql).not.toMatch(/for delete/i);
    expect(sql).not.toMatch(/grant[^;]*delete/i);
    expect(sql).toContain("'accident_logged'");
    expect(sql).toContain("'accident_status'");
  });
});
