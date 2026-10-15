import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  INVENTORY_REQUIRED_FROM,
  inventoryDayBadge,
  inventoryRequiredFor,
  inventoryStoragePath,
  missingInventorySlots,
  planInventoryUploads,
} from "./inventory-screenshots";
import { friendlyErrorMessage } from "./error-messages";

const sql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261007120000_0071_inventory_screenshots.sql",
  import.meta.url
)), "utf8");
const cleanup = readFileSync(fileURLToPath(new URL(
  "../../supabase/functions/cleanup_overtime_evidence/index.ts",
  import.meta.url
)), "utf8");

describe("inventory screenshot rules", () => {
  it("requires inventory for field staff from the rollout date only", () => {
    expect(inventoryRequiredFor("2026-10-07")).toBe(false);
    expect(inventoryRequiredFor(INVENTORY_REQUIRED_FROM)).toBe(true);
    expect(inventoryRequiredFor("2026-10-09", { officeEmployee: true })).toBe(false);
  });

  it("shows a green check once the 3 captures are sent, a red X when a required day lacks them", () => {
    expect(inventoryDayBadge("2026-10-08", 3, true)).toBe("done");
    expect(inventoryDayBadge("2026-10-08", 2, true)).toBe("missing");
    expect(inventoryDayBadge("2026-10-08", 0, true)).toBe("missing");
  });

  it("stays silent for employees without the option and for pre-rollout days", () => {
    expect(inventoryDayBadge("2026-10-08", 0, false)).toBeNull();
    expect(inventoryDayBadge("2026-10-07", 0, true)).toBeNull();
    expect(inventoryDayBadge("2026-10-07", 3, true)).toBe("done");
  });

  it("lists the slots still missing", () => {
    expect(missingInventorySlots([])).toEqual([1, 2, 3]);
    expect(missingInventorySlots([{ slot: 1 }, { slot: 3 }])).toEqual([2]);
    expect(missingInventorySlots([{ slot: 1 }, { slot: 2 }, { slot: 3 }])).toEqual([]);
  });

  it("stores objects under the owner's folder", () => {
    expect(inventoryStoragePath("u1", "2026-10-08", 2, "x")).toBe("u1/2026-10-08/inventory-2-x.jpg");
  });

  it("maps the database rejection to a translated message", () => {
    expect(friendlyErrorMessage({ message: "inventory_screenshots_required" }, (k) => `t:${k}`, "fb"))
      .toBe("t:form.errors.inventoryRequired");
  });
});

const optIn = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261007130000_0072_inventory_screenshots_opt_in.sql",
  import.meta.url
)), "utf8");

describe("0072 per-employee opt-in", () => {
  it("adds an off-by-default profile flag and gates submission on it", () => {
    expect(optIn).toContain("inventory_screenshots_enabled boolean not null default false");
    expect(optIn).toContain("coalesce(inventory_enabled, false)");
    expect(optIn).toContain("message = 'inventory_screenshots_required'");
    expect(optIn).toContain(`new.job_date >= date '${INVENTORY_REQUIRED_FROM}'`);
  });
});

describe("0071 migration", () => {
  it("keeps the database rollout date equal to the client constant", () => {
    expect(sql).toContain(`new.job_date >= date '${INVENTORY_REQUIRED_FROM}'`);
  });

  it("blocks submission without three distinct slots and exempts office staff", () => {
    expect(sql).toContain("count(distinct s.slot)");
    expect(sql).toContain("message = 'inventory_screenshots_required'");
    expect(sql).toContain("not coalesce(is_office_employee, false)");
  });

  it("limits each employee to one row per day and slot, in an owner-scoped private bucket", () => {
    expect(sql).toContain("unique (user_id, job_date, slot)");
    expect(sql).toContain("slot smallint not null check (slot between 1 and 3)");
    expect(sql).toContain("(storage.foldername(name))[1] = (auth.uid())::text");
    expect(sql).toContain("'inventory-screenshots', 'inventory-screenshots', false");
  });

  it("is reconciled and expired by the cleanup worker", () => {
    expect(sql).toContain("'inventory-screenshots'");
    expect(cleanup).toContain("inventory_screenshots");
  });
});

describe("several inventory screenshots picked at once", () => {
  const file = (name, lastModified) => ({ name, lastModified });
  const plan = (files, rows = []) => {
    const { uploads, extra } = planInventoryUploads(files, rows);
    return { slots: uploads.map((u) => `${u.slot}:${u.file.name}`), extra };
  };

  it("fills slots 1 to 3 in the order the screenshots were taken", () => {
    expect(plan([file("c", 30), file("a", 10), file("b", 20)])).toEqual({ slots: ["1:a", "2:b", "3:c"], extra: 0 });
  });

  it("keeps the picker's order when the times are equal or unknown", () => {
    expect(plan([file("x", 5), file("y", 5), file("z")])).toEqual({ slots: ["1:z", "2:x", "3:y"], extra: 0 });
    expect(plan([file("x"), file("y"), file("z")])).toEqual({ slots: ["1:x", "2:y", "3:z"], extra: 0 });
  });

  it("puts fewer files into the missing slots only", () => {
    expect(plan([file("b", 2), file("a", 1)], [{ slot: 1 }])).toEqual({ slots: ["2:a", "3:b"], extra: 0 });
    expect(plan([file("a", 1)], [{ slot: 1 }, { slot: 3 }])).toEqual({ slots: ["2:a"], extra: 0 });
  });

  it("never overwrites a filled slot with a partial pick", () => {
    expect(plan([file("a", 1), file("b", 2)], [{ slot: 1 }, { slot: 2 }])).toEqual({ slots: ["3:a"], extra: 1 });
    expect(plan([file("a", 1)], [{ slot: 1 }, { slot: 2 }, { slot: 3 }])).toEqual({ slots: [], extra: 1 });
  });

  it("a full set replaces all three; files beyond three are reported, not used", () => {
    expect(plan([file("a", 1), file("b", 2), file("c", 3)], [{ slot: 2 }])).toEqual({ slots: ["1:a", "2:b", "3:c"], extra: 0 });
    expect(plan([file("a", 1), file("b", 2), file("c", 3), file("d", 4)])).toEqual({ slots: ["1:a", "2:b", "3:c"], extra: 1 });
  });
});
