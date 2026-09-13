// Money primitives for the payroll engine.
//
// Rule (spec step 28): never accumulate pay in naive floats. All persisted and
// compared amounts are integer *cents*. We convert to/from dollars only at the
// edges (rule constants are written in dollars for readability; results are
// rendered in dollars). Every intermediate contribution is rounded to whole
// cents at its module boundary via `roundCents`, per each module's declared
// rounding policy (spec step 29).

export function toCents(dollars) {
  if (dollars == null || Number.isNaN(Number(dollars))) return 0;
  // + a tiny epsilon nudge so 21.505 * 100 doesn't fall to 2150 on binary error.
  return Math.round((Number(dollars) + Number.EPSILON) * 100);
}

export function toDollars(cents) {
  return (Number(cents) || 0) / 100;
}

// Round a dollar amount to whole cents and return cents (integer).
export function roundCents(dollars) {
  return Math.round((Number(dollars) || 0) * 100 + Number.EPSILON);
}

// Clamp a period contribution (in cents) so YTD never exceeds an annual maximum.
// Returns the amount actually withheld this period, never more than `remaining`.
// This is the fundamental cap rule (spec step 5): withheld = min(calc, remaining).
export function clampToRemaining(calculatedCents, ytdCents, annualMaxCents) {
  if (annualMaxCents == null) return Math.max(0, calculatedCents);
  const remaining = Math.max(0, annualMaxCents - (ytdCents || 0));
  return Math.max(0, Math.min(calculatedCents, remaining));
}

// Present cents as a dollar number rounded to 2 decimals (for the result shape).
export function money(cents) {
  return Math.round(Number(cents) || 0) / 100;
}
