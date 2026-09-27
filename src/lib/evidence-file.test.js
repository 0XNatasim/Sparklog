import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_EVIDENCE_BYTES, detectImageMime, validateEvidenceFile } from "./evidence-file";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260927025342_0065_evidence_hardening_and_orphan_cleanup.sql",
  import.meta.url
)), "utf8");
const cleanupSource = readFileSync(fileURLToPath(new URL(
  "../../supabase/functions/cleanup_overtime_evidence/index.ts",
  import.meta.url
)), "utf8");

const fileFrom = (bytes, type = "application/octet-stream") => new File([new Uint8Array(bytes)], "proof.bin", { type });

describe("evidence file hardening", () => {
  it("detects image content from magic bytes instead of the declared MIME", () => {
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMime(new TextEncoder().encode("RIFFxxxxWEBP"))).toBe("image/webp");
    expect(detectImageMime(new TextEncoder().encode("<script>"))).toBeNull();
  });

  it("rejects spoofed and oversized evidence", async () => {
    await expect(validateEvidenceFile(fileFrom(new TextEncoder().encode("not an image"), "image/jpeg")))
      .rejects.toThrow("evidence_file_type_invalid");
    const oversized = { size: MAX_EVIDENCE_BYTES + 1, slice: () => new Blob() };
    await expect(validateEvidenceFile(oversized)).rejects.toThrow("evidence_file_too_large");
  });

  it("accepts a valid image signature even when the browser MIME is generic", async () => {
    await expect(validateEvidenceFile(fileFrom([0xff, 0xd8, 0xff, 0x00]))).resolves.toBe("image/jpeg");
  });

  it("locks storage limits, orphan grace, raw-text purge and reconciliation into the backend contract", () => {
    expect(migrationSql).toContain(`file_size_limit = ${MAX_EVIDENCE_BYTES}`);
    expect(migrationSql).toContain("greatest(p_older_than, interval '1 hour')");
    expect(migrationSql).not.toContain("update public.overtime_evidence set ocr_text = null");
    expect(cleanupSource).toContain('rpc("find_orphaned_evidence_objects"');
    expect(cleanupSource).toContain("orphaned_deleted");
  });
});
