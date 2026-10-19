// Canadian SIN (NAS) check digit — Luhn, the same rule as public.sin_is_valid() (migration 0102), which
// set_nas enforces server-side. Checked here first so the owner gets a clear message before the round trip.
export function isValidSin(value) {
  const digits = String(value ?? "");
  if (!/^[0-9]{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const d = Number(digits[i]);
    const v = i % 2 === 1 ? d * 2 : d; // 2nd, 4th, 6th, 8th digits are doubled
    sum += v > 9 ? v - 9 : v;
  }
  return sum % 10 === 0;
}
