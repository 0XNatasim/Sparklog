import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_PARKING_PICTURES, mergeParkingPaths, orderPickedFiles, parkingReceiptPaths, parkingStoragePath } from "./parking-receipts";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
const migration = readdirSync(migrationsDir).find((name) => /_0095_parking_receipt_pictures\.sql$/.test(name));
const migrationSql = readFileSync(`${migrationsDir}/${migration}`, "utf8");

describe("parking receipts with several pictures", () => {
  it("lists the first picture then the extras, ignoring blanks", () => {
    expect(parkingReceiptPaths(null)).toEqual([]);
    expect(parkingReceiptPaths({ storage_path: "u/d/a.jpg" })).toEqual(["u/d/a.jpg"]);
    expect(parkingReceiptPaths({ storage_path: "u/d/a.jpg", extra_storage_paths: ["u/d/b.jpg", "", null, "u/d/c.jpg"] }))
      .toEqual(["u/d/a.jpg", "u/d/b.jpg", "u/d/c.jpg"]);
  });

  it("orders picked files oldest first, keeping the picker's order on ties", () => {
    const a = { name: "a", lastModified: 30 };
    const b = { name: "b", lastModified: 10 };
    const c = { name: "c", lastModified: 10 };
    const d = { name: "d" };
    expect(orderPickedFiles([a, b, c, d]).map((f) => f.name)).toEqual(["d", "b", "c", "a"]);
    expect(orderPickedFiles(null)).toEqual([]);
  });

  it("appends to the saved pictures or replaces them", () => {
    expect(mergeParkingPaths(["x"], ["y", "z"], "add")).toEqual({ storage_path: "x", extra_storage_paths: ["y", "z"] });
    expect(mergeParkingPaths(["x"], ["y", "z"], "replace")).toEqual({ storage_path: "y", extra_storage_paths: ["z"] });
    expect(mergeParkingPaths([], ["y"], "add")).toEqual({ storage_path: "y", extra_storage_paths: [] });
    expect(mergeParkingPaths([], [], "add")).toBeNull();
  });

  it("refuses more pictures than the database accepts", () => {
    const many = Array.from({ length: MAX_PARKING_PICTURES }, (_, i) => `p${i}`);
    expect(mergeParkingPaths([], many, "add")?.extra_storage_paths).toHaveLength(MAX_PARKING_PICTURES - 1);
    expect(mergeParkingPaths(["x"], many, "add")).toBeNull();
    expect(mergeParkingPaths(["x"], many, "replace")).not.toBeNull();
  });

  it("builds paths inside the employee's own folder", () => {
    expect(parkingStoragePath("u1", "2026-10-16", "id")).toBe("u1/2026-10-16/id.jpg");
  });

  it("matches the 0095 migration: extras column, limit, own folder, orphan finder", () => {
    expect(migrationSql).toContain("extra_storage_paths text[] not null default '{}'");
    expect(migrationSql).toContain(`cardinality(extra_storage_paths) <= ${MAX_PARKING_PICTURES - 1}`);
    expect(migrationSql).toContain("o.name = any(p.extra_storage_paths)");
    expect(migrationSql).toMatch(/like new\.user_id::text \|\| '\/%'/);
  });
});
