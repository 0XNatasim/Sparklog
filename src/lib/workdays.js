// Work days of the crew: Monday to Friday, minus the CCQ non-worked days kept in
// company_holidays (jours fériés chômés and the construction vacation weeks, convention ICI
// 19.03-19.04). Nobody is expected to enter time on those days, so no screen may flag a
// missing time-sheet for them. Dates are YYYY-MM-DD (company calendar day).
const toSet = (holidays) => (holidays instanceof Set ? holidays : new Set(holidays || []));

export function isWeekendDate(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function isNonWorkday(date, holidays = []) {
  return isWeekendDate(date) || toSet(holidays).has(String(date).slice(0, 10));
}

// The work days to check for jobs not submitted, newest first: the previous work day first (always), then each earlier
// work day back to the Monday of the week of `today`. On a Monday it is only the previous Friday.
export function lookbackWorkdays(today, holidays = []) {
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const mondayKey = monday.toISOString().slice(0, 10);
  const days = [previousWorkday(today, holidays)];
  for (let next = previousWorkday(days[0], holidays); next >= mondayKey; next = previousWorkday(next, holidays)) days.push(next);
  return days;
}

// The last work day before `date`: Monday looks back to Friday, the day after a holiday skips it.
export function previousWorkday(date, holidays = []) {
  const set = toSet(holidays);
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1);
  while (isNonWorkday(d.toISOString().slice(0, 10), set));
  return d.toISOString().slice(0, 10);
}
