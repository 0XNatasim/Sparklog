import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/ocr", () => ({ compressImage: vi.fn() }));

import {
  MAX_ACCIDENT_FILES, MAX_DOCUMENT_BYTES, MAX_PICTURE_BYTES, accidentFileCount, accidentFilePath, addPickedAccidentFiles, classifyAccidentFile, formatBytes,
} from "./accident-files";

const file = (name, type, size = 1000) => ({ name, type, size });

describe("classifyAccidentFile", () => {
  it("sends a picture as JPEG, whatever its format", () => {
    expect(classifyAccidentFile(file("IMG_1.HEIC", "image/heic"))).toEqual({ kind: "image", mime: "image/jpeg", ext: "jpg" });
    expect(classifyAccidentFile(file("a.png", "image/png"))).toMatchObject({ kind: "image" });
  });

  it("refuses SVG pictures (they can carry a script)", () => {
    expect(classifyAccidentFile(file("a.svg", "image/svg+xml"))).toBeNull();
    expect(classifyAccidentFile(file("a.svg", ""))).toBeNull();
  });

  it("knows a document by its extension even when the browser gives no type", () => {
    expect(classifyAccidentFile(file("Rapport.PDF", ""))).toEqual({ kind: "document", mime: "application/pdf", ext: "pdf" });
    expect(classifyAccidentFile(file("formulaire.docx", ""))).toMatchObject({ kind: "document", ext: "docx" });
    expect(classifyAccidentFile(file("notes.xlsx", "application/octet-stream"))).toMatchObject({ kind: "document", ext: "xlsx" });
    expect(classifyAccidentFile(file("liste.csv", "text/csv"))).toMatchObject({ kind: "document" });
  });

  it("refuses scripts, pages and archives", () => {
    for (const name of ["a.html", "a.js", "a.exe", "a.zip", "a.svg", "noextension"]) expect(classifyAccidentFile(file(name, "")), name).toBeNull();
  });
});

describe("addPickedAccidentFiles", () => {
  it("keeps the accepted files and counts the others", () => {
    const { files, skipped } = addPickedAccidentFiles([], [file("a.pdf", "application/pdf"), file("b.exe", ""), file("c.jpg", "image/jpeg")]);
    expect(files.map((f) => f.name)).toEqual(["a.pdf", "c.jpg"]);
    expect(skipped).toBe(1);
  });

  it("lets a large phone picture in (it is shrunk) but not a large document, nor an empty file", () => {
    const { files, skipped } = addPickedAccidentFiles([], [
      file("photo.jpg", "image/jpeg", MAX_PICTURE_BYTES), file("big.pdf", "application/pdf", MAX_DOCUMENT_BYTES + 1), file("empty.pdf", "application/pdf", 0),
    ]);
    expect(files.map((f) => f.name)).toEqual(["photo.jpg"]);
    expect(skipped).toBe(2);
  });

  it("stops at 20 files in all, counting those already on the file", () => {
    const picked = Array.from({ length: 5 }, (_, i) => file(`d${i}.pdf`, "application/pdf"));
    expect(addPickedAccidentFiles([], picked, MAX_ACCIDENT_FILES - 2).files).toHaveLength(2);
    expect(addPickedAccidentFiles([], picked, MAX_ACCIDENT_FILES).files).toHaveLength(0);
  });
});

describe("small helpers", () => {
  it("builds the path in the folder of the accident", () => {
    expect(accidentFilePath("acc-1", "obj-2", "pdf")).toBe("acc-1/obj-2.pdf");
  });
  it("formats sizes in French units", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(2048)).toBe("2 Ko");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 Mo");
  });
  it("reads the count embedded in an accident row", () => {
    expect(accidentFileCount({ accident_files: [{ count: 3 }] })).toBe(3);
    expect(accidentFileCount({})).toBe(0);
    expect(accidentFileCount(undefined)).toBe(0);
  });
});

describe("migration 0123", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261029150000_0123_accident_files.sql", import.meta.url), "utf8");
  it("keeps the bucket private and readable by managers only", () => {
    expect(sql).toContain("'accident-files', 'accident-files', false");
    expect(sql).toContain("public = false");
    expect(sql).toContain("bucket_id = 'accident-files' and public.get_my_role() = 'manager'");
    expect(sql).not.toMatch(/accident-files'[^;]*authenticated read/i);
  });
  it("limits type and size, and refuses scripts and pages", () => {
    expect(sql).toContain("10485760");
    for (const type of ["application/pdf", "image/jpeg", "text/plain"]) expect(sql).toContain(type);
    for (const type of ["text/html", "image/svg+xml", "application/javascript"]) expect(sql).not.toContain(type);
  });
  it("lets managers add and remove a file, never edit one, with an audit trail", () => {
    expect(sql).toContain("grant select, insert, delete on public.accident_files to authenticated");
    expect(sql).not.toMatch(/grant[^;]*update[^;]*accident_files/i);
    expect(sql).toContain("'accident_file_added'");
    expect(sql).toContain("'accident_file_removed'");
    expect(sql).toContain(">= 20");
  });
});
