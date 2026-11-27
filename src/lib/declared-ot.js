// The work order an overtime proof is for, typed by the employee before the proof page (migration 0166): the form of 27 November
// 2026 no longer holds an « Ordre de travail » question, so it is asked here.
import { withTimeout } from "@/lib/utils";

// « 270825 », « OT-270825 », « ot 270825 » → "270825"; anything that is not 3 to 8 digits → null (the same rule as the database).
export function cleanDeclaredOt(text) {
  const digits = String(text ?? "").replace(/[^0-9]/g, "");
  return /^[0-9]{3,8}$/.test(digits) ? digits : null;
}

// Digits of the OT of a sheet (« OT-231731 » → "231731"), or "" when it has none (a preset like « CONTREMAÎTRE »).
export const sheetOtDigits = (ot) => String(ot ?? "").replace(/[^0-9]/g, "");

// The typed OT and the sheet's OT are both numbers and differ: the employee is told, but is never blocked (the managers see it in
// the OCR tab as a difference).
export const declaredOtDiffers = (declared, sheetOt) => {
  const clean = cleanDeclaredOt(declared);
  const digits = sheetOtDigits(sheetOt);
  return Boolean(clean && digits.length >= 3 && clean !== digits);
};

// Best effort, after the proofs are saved: a failure leaves the declared OT empty (the managers then see the sheet's OT only) and
// never fails the proof. Returns how many were recorded.
export async function setProofDeclaredOt(client, evidenceIds, text) {
  const ot = cleanDeclaredOt(text);
  if (!ot) return 0;
  let saved = 0;
  for (const id of [...new Set((evidenceIds || []).filter(Boolean))]) {
    try {
      const { error } = await withTimeout(client.rpc("set_own_proof_declared_ot", { p_evidence_id: id, p_ot: ot }), 12000);
      if (error) throw error;
      saved += 1;
    } catch (error) {
      console.warn("[declared-ot] not recorded", error);
    }
  }
  return saved;
}
