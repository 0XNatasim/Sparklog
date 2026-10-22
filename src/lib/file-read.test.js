import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EvidenceFileError, evidenceUploadFailure, fileDiagnostics, isFileFailure, readPickedFile } from "./evidence-file";

const notReadable = () => Object.assign(new Error("The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired."), { name: "NotReadableError" });
// A picked file whose first `failures` reads are refused by the phone.
const flakyFile = (failures, bytes = [0xff, 0xd8, 0xff, 0x00]) => {
  let calls = 0;
  return {
    size: bytes.length,
    type: "image/jpeg",
    lastModified: 1_000_000,
    get calls() { return calls; },
    arrayBuffer: async () => {
      calls += 1;
      if (calls <= failures) throw notReadable();
      return new Uint8Array(bytes).buffer;
    },
  };
};
const noSleep = async () => {};

describe("reading a picked picture (V2.4.170)", () => {
  it("retries a read the phone refuses for a moment, then keeps an in-memory copy", async () => {
    const file = flakyFile(2);
    const copy = await readPickedFile(file, { sleep: noSleep });
    expect(file.calls).toBe(3);
    expect(copy).toBeInstanceOf(Blob);
    expect(copy.size).toBe(4);
    expect(copy.type).toBe("image/jpeg");
  });

  it("gives up after 3 attempts with a clear « unreadable » reason at the read step", async () => {
    const file = flakyFile(5);
    const error = await readPickedFile(file, { sleep: noSleep }).catch((e) => e);
    expect(error).toBeInstanceOf(EvidenceFileError);
    expect(error.message).toBe("evidence_file_unreadable");
    expect(error.step).toBe("read");
    expect(error.attempts).toBe(3);
    expect(error.cause.name).toBe("NotReadableError");
    expect(evidenceUploadFailure(error).key).toBe("unreadable");
    expect(file.calls).toBe(3);
  });

  it("does not retry an error that is not a refused read, and reports empty files", async () => {
    let calls = 0;
    const broken = { size: 4, type: "image/png", arrayBuffer: async () => { calls += 1; throw new TypeError("boom"); } };
    await expect(readPickedFile(broken, { sleep: noSleep })).rejects.toThrow("evidence_file_unreadable");
    expect(calls).toBe(1);
    await expect(readPickedFile({ size: 0, arrayBuffer: async () => new ArrayBuffer(0) })).rejects.toThrow("evidence_file_empty");
  });

  it("tells file problems from network problems (no diagnostic, retry button kept for the network)", () => {
    expect(isFileFailure(new EvidenceFileError("evidence_image_decode_failed", { step: "decode" }))).toBe(true);
    expect(isFileFailure(notReadable())).toBe(true);
    expect(isFileFailure(new TypeError("Failed to fetch"))).toBe(false);
    expect(isFileFailure({ status: 401, message: "JWT expired" })).toBe(false);
  });

  it("builds the Journal diagnostic without the picture", () => {
    const file = { size: 245_760, type: "image/jpeg", lastModified: 1_000_000 };
    const error = new EvidenceFileError("evidence_file_unreadable", { step: "read", cause: notReadable(), attempts: 3 });
    const d = fileDiagnostics(file, error, { now: 1_004_000, userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S911W)", installed: true });
    expect(d).toMatchObject({ size: 245_760, type: "image/jpeg", age_s: 4, step: "read", reason: "unreadable", attempts: 3, app: "installed" });
    expect(d.error).toMatch(/^NotReadableError: The requested file could not be read/);
    expect(d.error.length).toBeLessThanOrEqual(80);
    expect(d.browser).toContain("Android 14");
    expect(Object.keys(d).sort()).toEqual(["age_s", "app", "attempts", "browser", "error", "reason", "size", "step", "type"]);
  });

  it("logs through a narrow function: known keys only, own entry, 20 an hour, no anonymous call", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261022230000_0112_file_read_error_log.sql", import.meta.url), "utf8");
    expect(sql).toContain("p_context not in ('overtime', 'inventory', 'parking')");
    expect(sql).toContain("v_key in ('size', 'age_s', 'attempts')");
    expect(sql).toContain("v_key in ('type', 'step', 'error', 'reason', 'browser', 'app')");
    expect(sql).toMatch(/action = 'file_read_error' and a\.created_at > now\(\) - interval '1 hour'\) >= 20/);
    expect(sql).toMatch(/values \(v_uid, public\.audit_actor_name\(v_uid\), 'file_read_error', v_uid/);
    expect(sql).toContain("revoke all on function public.log_file_read_error(text, jsonb) from public, anon;");
  });

  it("reads the screenshot once, reuses the copy for « Réessayer », and reports each kind of picture", () => {
    const form = readFileSync(new URL("../pages/EmployeeForm.jsx", import.meta.url), "utf8");
    expect(form).toContain("source = file instanceof File ? await readPickedFile(file) : file;");
    expect(form).toContain("setFailedEvidenceFile(committed ? file : source);");
    for (const context of ["overtime", "inventory", "parking"]) expect(form).toContain(`reportFileReadError("${context}"`);
  });
});
