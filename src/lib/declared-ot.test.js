import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { cleanDeclaredOt, declaredOtDiffers, setProofDeclaredOt, sheetOtDigits } from "./declared-ot";

describe("the OT typed before the proof page", () => {
  it("keeps the digits of 3 to 8, whatever the prefix, and refuses the rest", () => {
    expect(cleanDeclaredOt("270825")).toBe("270825");
    expect(cleanDeclaredOt(" OT-270825 ")).toBe("270825");
    expect(cleanDeclaredOt("ot 1234")).toBe("1234");
    expect(cleanDeclaredOt("12")).toBeNull();
    expect(cleanDeclaredOt("123456789")).toBeNull();
    expect(cleanDeclaredOt("")).toBeNull();
    expect(cleanDeclaredOt("CONTREMAÎTRE")).toBeNull();
  });

  it("warns only when both OT are numbers and differ", () => {
    expect(sheetOtDigits("OT-231731")).toBe("231731");
    expect(declaredOtDiffers("270825", "270825")).toBe(false);
    expect(declaredOtDiffers("270825", "OT-270825")).toBe(false);
    expect(declaredOtDiffers("270825", "231731")).toBe(true);
    expect(declaredOtDiffers("270825", "CONTREMAÎTRE")).toBe(false);
    expect(declaredOtDiffers("", "231731")).toBe(false);
  });

  it("records the OT of each proof, one call each, and never throws", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "job_not_editable" } });
    const client = { rpc };
    const saved = await setProofDeclaredOt(client, ["e1", "e2", "e1", null], "OT-270825");
    expect(saved).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("set_own_proof_declared_ot", { p_evidence_id: "e1", p_ot: "270825" });
    // nothing valid typed: no call at all
    rpc.mockClear();
    expect(await setProofDeclaredOt(client, ["e1"], "12")).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("migration 0166", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261127150000_0166_declared_ot.sql"), "utf8");
  it("adds the typed OT next to the proof, digits only, and an RPC that only fills the caller's own proof", () => {
    expect(sql).toContain("add column if not exists declared_ot text");
    expect(sql).toContain("declared_ot ~ '^[0-9]{3,8}$'");
    expect(sql).toContain("e.id = p_evidence_id and e.user_id = uid");
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.set_own_proof_declared_ot(uuid, text) from public, anon");
    expect(sql).toContain("grant execute on function public.set_own_proof_declared_ot(uuid, text) to authenticated");
  });
  it("leaves proof_ot (what the reader found on an older form) alone", () => {
    expect(sql).not.toMatch(/update public\.overtime_evidence set proof_ot/);
  });
});
