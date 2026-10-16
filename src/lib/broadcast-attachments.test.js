import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MAX_BROADCAST_ATTACHMENTS, MAX_PDF_BYTES, addPickedFiles, attachmentStoragePath,
  broadcastAttachmentColumns, broadcastAttachments, isImageFile, isPdfFile,
} from "./broadcast-attachments";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261016150000_0096_broadcast_attachments.sql", import.meta.url,
)), "utf8");

const img = (name = "a.png") => ({ name, type: "image/png", size: 1000 });
const pdf = (name = "doc.pdf", size = 1000) => ({ name, type: "application/pdf", size });

describe("broadcast attachments (Communications)", () => {
  it("recognises pictures and PDFs, by type or by .pdf name", () => {
    expect(isImageFile(img())).toBe(true);
    expect(isPdfFile(pdf())).toBe(true);
    expect(isPdfFile({ name: "Horaire.PDF", type: "" })).toBe(true);
    expect(isImageFile(pdf())).toBe(false);
    expect(isImageFile({ name: "x.docx", type: "application/msword" })).toBe(false);
  });

  it("adds pictures and PDFs in order, skipping other files, big PDFs and the overflow", () => {
    const { files, skipped } = addPickedFiles([img("old.png")], [pdf(), { name: "x.zip", type: "application/zip" }, pdf("big.pdf", MAX_PDF_BYTES + 1), img("b.png")]);
    expect(files.map((f) => f.name)).toEqual(["old.png", "doc.pdf", "b.png"]);
    expect(skipped).toBe(2);
    const many = Array.from({ length: MAX_BROADCAST_ATTACHMENTS + 2 }, (_, i) => img(`${i}.png`));
    const full = addPickedFiles([], many);
    expect(full.files).toHaveLength(MAX_BROADCAST_ATTACHMENTS);
    expect(full.skipped).toBe(2);
  });

  it("reads the attachments, falling back to the single picture of older messages", () => {
    expect(broadcastAttachments({ image_path: "old.jpg", attachments: [] })).toEqual([{ path: "old.jpg", kind: "image", name: "" }]);
    expect(broadcastAttachments({ image_path: "a.jpg", attachments: [{ path: "a.jpg", kind: "image" }, { path: "b.pdf", kind: "pdf", name: "Horaire.pdf" }] }))
      .toEqual([{ path: "a.jpg", kind: "image", name: "" }, { path: "b.pdf", kind: "pdf", name: "Horaire.pdf" }]);
    expect(broadcastAttachments(null)).toEqual([]);
  });

  it("keeps image_path on the first picture for apps not yet updated", () => {
    expect(broadcastAttachmentColumns([{ path: "b.pdf", kind: "pdf" }, { path: "a.jpg", kind: "image" }]))
      .toEqual({ attachments: [{ path: "b.pdf", kind: "pdf" }, { path: "a.jpg", kind: "image" }], image_path: "a.jpg" });
    expect(broadcastAttachmentColumns([{ path: "b.pdf", kind: "pdf" }]).image_path).toBeNull();
    expect(broadcastAttachmentColumns([])).toEqual({ attachments: [], image_path: null });
  });

  it("names stored files by kind", () => {
    expect(attachmentStoragePath("pdf", "id")).toBe("id.pdf");
    expect(attachmentStoragePath("image", "id")).toBe("id.jpg");
  });

  it("matches the 0096 migration (limit, bucket types and size)", () => {
    expect(migrationSql).toContain(`jsonb_array_length(attachments) <= ${MAX_BROADCAST_ATTACHMENTS}`);
    expect(migrationSql).toContain("'application/pdf'");
    expect(migrationSql).toContain(`file_size_limit = ${MAX_PDF_BYTES}`);
  });
});
