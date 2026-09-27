import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const versions = files.map((name) => name.split("_")[0]);

describe("migration folder matches the Supabase history format", () => {
  it("names every file <version>_<name>.sql", () => {
    for (const name of files) expect(name).toMatch(/^(\d{4}|\d{14})_[a-z0-9_]+\.sql$/);
  });

  it("keeps 4-digit versions to the legacy 0000-0026 range so new files sort after them", () => {
    const legacy = versions.filter((version) => version.length === 4);
    expect(legacy.every((version) => Number(version) <= 26)).toBe(true);
  });

  it("uses each version once and applies files in version order", () => {
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((a, b) => Number(a) - Number(b)));
  });
});
