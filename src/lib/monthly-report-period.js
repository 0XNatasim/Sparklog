// CCQ monthly report period.
//
// Each monthly reporting period ENDS on the LAST SATURDAY of a month — the same
// Saturday week-ending the payroll engine uses (see payrollWeekKey in
// payroll-calculations.js). A given work date belongs to the period ending on the
// first last-Saturday-of-month that is on or after that date; the period starts the
// day after the previous month's last Saturday.
//
// Dependency-free and UTC-based (like payroll-calculations.js) so day-of-week is
// stable regardless of the runtime timezone.

function toUTCDate(input) {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const d = new Date(`${String(input || "").slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Last Saturday (as a UTC Date) of the given year and 1-based month (1 = January).
export function lastSaturdayOfMonth(year, month) {
  const d = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of `month`
  const back = (d.getUTCDay() - 6 + 7) % 7;      // days to step back to Saturday (getUTCDay 6)
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

// The monthly report period a work date falls in.
// Returns { key, start, end } with each value a 'YYYY-MM-DD' string; `end` (= `key`)
// is the last Saturday that closes the period. Returns null for an unparseable date.
export function monthlyReportPeriod(input) {
  const d = toUTCDate(input);
  if (!d) return null;

  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  let end = lastSaturdayOfMonth(y, m);
  if (d.getTime() > end.getTime()) {
    // Date is after its own month's last Saturday → it belongs to next month's period.
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    end = lastSaturdayOfMonth(ny, nm);
  }

  // Start = day after the previous month's last Saturday (relative to `end`'s month).
  const em = end.getUTCMonth() + 1;
  const ey = end.getUTCFullYear();
  const pm = em === 1 ? 12 : em - 1;
  const py = em === 1 ? ey - 1 : ey;
  const start = lastSaturdayOfMonth(py, pm);
  start.setUTCDate(start.getUTCDate() + 1);

  return { key: iso(end), start: iso(start), end: iso(end) };
}
