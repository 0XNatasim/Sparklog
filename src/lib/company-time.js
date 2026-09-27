// America/Toronto is the canonical IANA zone for Montréal civil time. It tracks
// Québec's EST/EDT changes; a fixed UTC offset must never be used for work dates.
export const COMPANY_TIME_ZONE = "America/Toronto";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMPANY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMPANY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(formatter, instant) {
  return Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value])
  );
}

export function companyDate(instant = new Date()) {
  const p = parts(dateFormatter, instant);
  return `${p.year}-${p.month}-${p.day}`;
}

export function companyDateTimeParts(instant = new Date()) {
  const p = parts(dateTimeFormatter, instant);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

export function addCalendarDays(date, days) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

// Resolve a Montréal wall-clock value without guessing through a DST fold/gap.
// Montréal offsets are UTC-5/UTC-4; testing both yields 0 candidates in the spring
// gap, 2 during the repeated fall hour, and exactly 1 for an unambiguous time.
export function resolveCompanyWallTime(date, time) {
  const match = `${date || ""}T${time || ""}`.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/
  );
  if (!match) return { status: "invalid", instant: null };
  const [, y, mo, d, h, mi] = match.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) {
    return { status: "invalid", instant: null };
  }
  const wallUtc = Date.UTC(y, mo - 1, d, h, mi);
  const expectedDate = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const expectedTime = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  const candidates = [4, 5]
    .map((offsetHours) => new Date(wallUtc + offsetHours * 60 * 60 * 1000))
    .filter((candidate) => {
      const actual = companyDateTimeParts(candidate);
      return actual.date === expectedDate && actual.time === expectedTime;
    });
  if (candidates.length === 0) return { status: "nonexistent", instant: null };
  if (candidates.length > 1) return { status: "ambiguous", instant: null };
  return { status: "valid", instant: candidates[0] };
}

export function resolveJobInstants(jobDate, depart, fin) {
  const endDate = String(fin) <= String(depart) ? addCalendarDays(jobDate, 1) : jobDate;
  const start = resolveCompanyWallTime(jobDate, depart);
  const end = resolveCompanyWallTime(endDate, fin);
  if (start.status !== "valid" || end.status !== "valid") {
    return { status: start.status !== "valid" ? start.status : end.status, start: null, end: null };
  }
  return { status: "valid", start: start.instant, end: end.instant };
}

