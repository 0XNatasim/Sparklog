import { QUEBEC_2026 } from "./2026.js";

// Registry of versioned rule sets, keyed by tax year + province of employment.
// Adding a year or province is a new entry here — never a branch inside the engine.
const REGISTRY = {
  2026: { QC: QUEBEC_2026 },
};

// Resolve the rule set for a pay run. Unsupported year/province is NOT guessed:
// the caller surfaces a requires_review result instead (ADR 0001 / spec step 10).
export function getRules(taxYear, provinceOfEmployment) {
  const year = REGISTRY[taxYear];
  if (!year) return { ok: false, reason: `No rule set for tax year ${taxYear}.` };
  const rules = year[provinceOfEmployment];
  if (!rules) {
    return { ok: false, reason: `No rule set for province ${provinceOfEmployment} in ${taxYear}.` };
  }
  return { ok: true, rules };
}

export { QUEBEC_2026 };
